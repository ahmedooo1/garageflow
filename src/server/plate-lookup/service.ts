import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { plateLookupQuota } from "@/lib/plans";
import { parseFrenchPlate, technicalCoverage, type VehicleTechnicalData } from "@/lib/plate";
import { assertPermission, type Ctx } from "@/server/context";
import { prisma } from "@/server/db";
import { getAppSecret } from "@/server/lib/crypto";
import { AppError, ValidationError } from "@/server/lib/errors";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { getAccess } from "@/server/services/billing";
import { plateLookupConfig, type PlateLookupConfig } from "./config";
import { PlateProviderError, type ProviderErrorCode } from "./provider";
import { sanitizeTechnical } from "./sanitize";

export type PlateQuota = { used: number; limit: number };

export type PlateLookupResult =
  | { status: "found"; lookupId: string; plate: string; data: VehicleTechnicalData; missing: string[]; source: string; fromCache: boolean; quota: PlateQuota }
  | { status: "not_found"; plate: string; source: string; quota: PlateQuota }
  | { status: "exists"; plate: string; vehicleId: string };

const MANUAL = "Saisissez les informations manuellement.";

const PROVIDER_MESSAGES: Record<ProviderErrorCode, string> = {
  timeout: `Le service d'identification n'a pas répondu à temps. ${MANUAL}`,
  unavailable: `Le service d'identification est indisponible pour le moment. ${MANUAL}`,
  auth: `La recherche par immatriculation est momentanément indisponible. ${MANUAL}`,
  provider_rate_limit: `Le service d'identification est saturé, réessayez dans quelques minutes. ${MANUAL}`,
  invalid_response: `La réponse du service d'identification est illisible. ${MANUAL}`,
};

/** Limites de débit, en plus du quota mensuel : protègent d'un script ou d'une saisie en boucle. */
const USER_RATE = { limit: 20, windowMs: 10 * 60_000 };
const GARAGE_RATE = { limit: 60, windowMs: 60 * 60_000 };
/** Un résultat ne peut servir à créer un véhicule que dans ce délai. */
const CONFIRM_WINDOW_MS = 24 * 3600 * 1000;

export function plateLookupEnabled(): boolean {
  return plateLookupConfig() !== null;
}

/** Empreinte propre au garage : l'immatriculation n'est jamais stockée en clair dans le journal. */
export function plateHash(garageId: string, normalized: string): string {
  return createHmac("sha256", getAppSecret()).update(`plaque:${garageId}:${normalized}`).digest("hex");
}

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function garageQuota(garageId: string, now: Date): Promise<PlateQuota> {
  const [access, used] = await Promise.all([getAccess(garageId), prisma.plateLookup.count({ where: { garageId, billable: true, createdAt: { gte: monthStart(now) } } })]);
  return { used, limit: plateLookupQuota(access) };
}

/** Deux recherches simultanées de la même plaque dans un garage ne paient qu'un appel. */
const inFlight = new Map<string, Promise<PlateLookupResult>>();

export async function lookupPlate(
  ctx: Ctx,
  rawPlate: string,
  opts: { config?: PlateLookupConfig | null; fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<PlateLookupResult> {
  assertPermission(ctx, "vehicles:write");
  const plate = parseFrenchPlate(rawPlate);
  if (!plate) {
    throw new ValidationError(`Immatriculation française non reconnue (formats AA-123-AA ou 123 ABC 75). ${MANUAL}`, { plate: "Format non reconnu" });
  }
  const config = opts.config === undefined ? plateLookupConfig() : opts.config;
  if (!config) throw new AppError(`La recherche par immatriculation n'est pas activée. ${MANUAL}`, 503, "PLATE_LOOKUP_DISABLED");
  const now = opts.now ?? new Date();

  // Déjà connu du garage : aucun appel, et la création serait refusée de toute façon.
  const existing = await prisma.vehicle.findUnique({ where: { garageId_plate: { garageId: ctx.garageId, plate: plate.normalized } }, select: { id: true } });
  if (existing) return { status: "exists", plate: plate.display, vehicleId: existing.id };

  enforceRateLimit(`plaque:user:${ctx.userId}`, USER_RATE);
  enforceRateLimit(`plaque:garage:${ctx.garageId}`, GARAGE_RATE);

  const hash = plateHash(ctx.garageId, plate.normalized);
  const key = `${ctx.garageId}:${hash}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const run = resolve(ctx, plate.display, plate, hash, config, opts.fetchImpl ?? fetch, now);
  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

async function resolve(
  ctx: Ctx,
  display: string,
  plate: NonNullable<ReturnType<typeof parseFrenchPlate>>,
  hash: string,
  config: PlateLookupConfig,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<PlateLookupResult> {
  const { provider } = config;
  const base = { garageId: ctx.garageId, userId: ctx.userId, plateHash: hash, provider: provider.id };

  // 1. Cache du garage (si le contrat du fournisseur l'autorise) : gratuit.
  if (config.cacheDays > 0) {
    const day = 24 * 3600 * 1000;
    // Une immatriculation inconnue peut être enregistrée entre-temps : elle n'est gardée qu'un jour.
    const cached = await prisma.plateLookup.findFirst({
      where: {
        garageId: ctx.garageId,
        plateHash: hash,
        provider: provider.id,
        fromCache: false,
        OR: [
          { status: "FOUND", createdAt: { gte: new Date(now.getTime() - config.cacheDays * day) } },
          { status: "NOT_FOUND", createdAt: { gte: new Date(now.getTime() - day) } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    if (cached) {
      const row = await prisma.plateLookup.create({ data: { ...base, status: cached.status, billable: false, fromCache: true, data: cached.data ?? undefined } });
      const quota = await garageQuota(ctx.garageId, now);
      if (cached.status === "NOT_FOUND" || !cached.data) return { status: "not_found", plate: display, source: provider.label, quota };
      const data = cached.data as unknown as VehicleTechnicalData;
      return { status: "found", lookupId: row.id, plate: display, data, missing: technicalCoverage(data).missing, source: provider.label, fromCache: true, quota };
    }
  }

  // 2. Quota du garage, puis plafond de la plateforme.
  const quota = await garageQuota(ctx.garageId, now);
  if (quota.used >= quota.limit) {
    throw new AppError(`Quota mensuel de recherches atteint (${quota.limit}). ${MANUAL}`, 429, "PLATE_LOOKUP_QUOTA");
  }
  const platformUsed = await prisma.plateLookup.count({ where: { billable: true, createdAt: { gte: monthStart(now) } } });
  if (platformUsed >= config.globalMonthlyCap) {
    console.warn(`[plaque] plafond mensuel de la plateforme atteint (${config.globalMonthlyCap})`);
    throw new AppError(`La recherche par immatriculation est suspendue jusqu'au mois prochain. ${MANUAL}`, 503, "PLATE_LOOKUP_CAP");
  }

  // 3. Appel au fournisseur, avec délai imposé. Seule l'immatriculation est transmise.
  const signal = AbortSignal.timeout(config.timeoutMs);
  let outcome;
  try {
    outcome = await provider.lookup(plate, { apiKey: config.apiKey, signal, fetchImpl });
  } catch (e) {
    const err = e instanceof PlateProviderError ? e : new PlateProviderError(signal.aborted ? "timeout" : "unavailable", signal.aborted, e instanceof Error ? e.message : "");
    await prisma.plateLookup.create({ data: { ...base, status: "ERROR", billable: err.billable, errorCode: err.code } });
    // Le détail (sans clé ni immatriculation) va au journal du serveur ; l'utilisateur reçoit un message clair.
    console.error(`[plaque] ${provider.id} : ${err.message}`);
    throw new AppError(PROVIDER_MESSAGES[err.code], 502, "PLATE_LOOKUP_PROVIDER");
  }

  if (!outcome.found) {
    await prisma.plateLookup.create({ data: { ...base, status: "NOT_FOUND", billable: provider.billsNotFound } });
    return { status: "not_found", plate: display, source: provider.label, quota: { ...quota, used: quota.used + (provider.billsNotFound ? 1 : 0) } };
  }

  const data = sanitizeTechnical(outcome.raw, now);
  const { found, missing } = technicalCoverage(data);
  if (found.length === 0) {
    await prisma.plateLookup.create({ data: { ...base, status: "NOT_FOUND", billable: true, errorCode: "empty" } });
    return { status: "not_found", plate: display, source: provider.label, quota: { ...quota, used: quota.used + 1 } };
  }
  const row = await prisma.plateLookup.create({ data: { ...base, status: "FOUND", billable: true, data: data as unknown as Prisma.InputJsonValue } });
  return { status: "found", lookupId: row.id, plate: display, data, missing, source: provider.label, fromCache: false, quota: { ...quota, used: quota.used + 1 } };
}

/**
 * Vérifie, au moment d'enregistrer le véhicule, que les données confirmées
 * viennent bien d'une recherche de ce garage, pour cette immatriculation,
 * récente. Renvoie le libellé de la source, ou null.
 */
export async function confirmedLookupSource(ctx: Ctx, lookupId: string, normalizedPlate: string, now = new Date()): Promise<string | null> {
  if (!lookupId) return null;
  const row = await prisma.plateLookup.findFirst({ where: { id: lookupId, garageId: ctx.garageId, status: "FOUND" } });
  if (!row || row.plateHash !== plateHash(ctx.garageId, normalizedPlate)) return null;
  if (now.getTime() - row.createdAt.getTime() > CONFIRM_WINDOW_MS) return null;
  const label = plateLookupConfig()?.provider.id === row.provider ? plateLookupConfig()!.provider.label : row.provider;
  return `Recherche par immatriculation (${label})`;
}
