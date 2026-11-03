import { z } from "zod";
import { normalizePostalCode, normalizeSiret } from "@/lib/growth/normalize";
import { TARGET_NAF, ZONES, type ZoneKey } from "@/lib/growth/zones";
import { getAppUrl } from "@/server/lib/request";

/**
 * Connecteur « API Recherche d'entreprises » (DINUM, données SIRENE de l'INSEE,
 * Licence Ouverte 2.0) : https://recherche-entreprises.api.gouv.fr
 *
 * - Aucune clé, aucune donnée personnelle demandée. Limite publiée : 7 requêtes
 *   par seconde ; on s'en tient à une requête toutes les 400 ms.
 * - Minimisation : seuls les champs utiles à la qualification sont conservés.
 *   Les dirigeants (personnes physiques) ne sont jamais lus ni stockés.
 * - Les unités dont la diffusion est restreinte (statut « P ») sont ignorées.
 */

export const SIRENE_API = "https://recherche-entreprises.api.gouv.fr/search";
/** Agent identifié, avec la page qui explique la collecte (domaine lu dans APP_URL). */
export function userAgent(): string {
  return `GarageFlow-prospection/1.0 (+${getAppUrl()}/confidentialite#prospection)`;
}
const PER_PAGE = 25;
const MIN_INTERVAL_MS = 400;

const etablissementSchema = z
  .object({
    siret: z.string(),
    adresse: z.string().nullish(),
    code_postal: z.string().nullish(),
    libelle_commune: z.string().nullish(),
    activite_principale: z.string().nullish(),
    etat_administratif: z.string().nullish(),
    date_creation: z.string().nullish(),
    tranche_effectif_salarie: z.string().nullish(),
    liste_enseignes: z.array(z.string()).nullish(),
    nom_commercial: z.string().nullish(),
  })
  .loose();

const uniteSchema = z
  .object({
    siren: z.string(),
    nom_complet: z.string().nullish(),
    nom_raison_sociale: z.string().nullish(),
    date_creation: z.string().nullish(),
    tranche_effectif_salarie: z.string().nullish(),
    nombre_etablissements_ouverts: z.number().nullish(),
    statut_diffusion: z.string().nullish(),
    etat_administratif: z.string().nullish(),
    matching_etablissements: z.array(etablissementSchema).nullish(),
  })
  .loose();

const responseSchema = z
  .object({
    results: z.array(uniteSchema),
    total_results: z.number().nullish(),
    total_pages: z.number().nullish(),
    page: z.number().nullish(),
  })
  .loose();

export type SireneResponse = z.infer<typeof responseSchema>;

export type LeadCandidate = {
  siret: string;
  siren: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  zone: ZoneKey;
  nafCode: string;
  companyCreatedOn: Date | null;
  workforceRange: string;
  establishmentsCount: number | null;
  sourceUrl: string;
  sourceFetchedAt: Date;
};

export function buildSireneUrl(zone: ZoneKey, page: number): string {
  const params = new URLSearchParams({
    activite_principale: TARGET_NAF,
    code_postal: ZONES[zone].postalCodes.join(","),
    etat_administratif: "A",
    per_page: String(PER_PAGE),
    page: String(page),
  });
  return `${SIRENE_API}?${params.toString()}`;
}

/** Fiche publique lisible par un humain, conservée comme source de chaque prospect. */
export function annuaireUrl(siret: string): string {
  return `https://annuaire-entreprises.data.gouv.fr/etablissement/${siret}`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
}

export type SkipReasons = {
  diffusionRestreinte: number;
  ferme: number;
  horsActivite: number;
  horsZone: number;
  siretInvalide: number;
  sansNom: number;
};

const emptyReasons = (): SkipReasons => ({ diffusionRestreinte: 0, ferme: 0, horsActivite: 0, horsZone: 0, siretInvalide: 0, sansNom: 0 });

/** Champs dont dépend le connecteur : leur absence signale un changement de format de l'API. */
const EXPECTED_UNITE = ["siren", "nom_complet", "matching_etablissements", "nombre_etablissements_ouverts", "tranche_effectif_salarie", "date_creation"] as const;
const EXPECTED_ETAB = ["siret", "code_postal", "activite_principale", "etat_administratif", "adresse", "libelle_commune"] as const;

/** Valeurs masquées par l'INSEE pour les personnes ayant demandé la non-diffusion. */
const NON_DIFFUSIBLE = /non[- ]diffusible/i;

/**
 * Transforme une page de résultats en candidats : un par établissement actif,
 * situé dans la zone et exerçant l'activité ciblée. Chaque exclusion est
 * comptée par motif, et les champs attendus mais absents sont signalés.
 */
export function mapSireneResults(
  raw: unknown,
  zone: ZoneKey,
  fetchedAt: Date,
): { candidates: LeadCandidate[]; skipped: number; reasons: SkipReasons; missingFields: string[]; totalPages: number; totalResults: number | null } {
  const data = responseSchema.parse(raw);
  const postalCodes = ZONES[zone].postalCodes;
  const candidates: LeadCandidate[] = [];
  const reasons = emptyReasons();
  const missing = new Set<string>();

  for (const unite of data.results) {
    for (const k of EXPECTED_UNITE) if (!(k in unite)) missing.add(`results[].${k}`);
    if ((unite.statut_diffusion && unite.statut_diffusion !== "O") || NON_DIFFUSIBLE.test(unite.nom_complet ?? "")) {
      reasons.diffusionRestreinte++;
      continue;
    }
    for (const etab of unite.matching_etablissements ?? []) {
      for (const k of EXPECTED_ETAB) if (!(k in etab)) missing.add(`matching_etablissements[].${k}`);
      const siret = normalizeSiret(etab.siret);
      const postalCode = normalizePostalCode(etab.code_postal ?? "");
      const naf = etab.activite_principale ?? "";
      if (!siret) reasons.siretInvalide++;
      else if (etab.etat_administratif !== "A") reasons.ferme++;
      else if (naf !== TARGET_NAF) reasons.horsActivite++;
      else if (!postalCodes.includes(postalCode)) reasons.horsZone++;
      else if (NON_DIFFUSIBLE.test(`${etab.adresse ?? ""} ${(etab.liste_enseignes ?? []).join(" ")}`)) reasons.diffusionRestreinte++;
      else {
        const enseigne = etab.liste_enseignes?.find((e) => e.trim()) ?? etab.nom_commercial ?? "";
        const name = titleCase((enseigne || unite.nom_complet || unite.nom_raison_sociale || "").trim());
        if (!name) {
          reasons.sansNom++;
          continue;
        }
        candidates.push({
          siret,
          siren: unite.siren,
          name,
          address: titleCase(etab.adresse ?? ""),
          postalCode,
          city: titleCase(etab.libelle_commune ?? ""),
          zone,
          nafCode: naf,
          companyCreatedOn: parseDate(unite.date_creation),
          workforceRange: etab.tranche_effectif_salarie ?? unite.tranche_effectif_salarie ?? "",
          establishmentsCount: unite.nombre_etablissements_ouverts ?? null,
          sourceUrl: annuaireUrl(siret),
          sourceFetchedAt: fetchedAt,
        });
      }
    }
  }
  const skipped = Object.values(reasons).reduce((a, b) => a + b, 0);
  return { candidates, skipped, reasons, missingFields: [...missing].sort(), totalPages: data.total_pages ?? 1, totalResults: data.total_results ?? null };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Parcourt une zone page par page, dans la limite de `maxPages`. Un 429 est
 * retenté deux fois avec attente croissante ; toute autre erreur interrompt la zone.
 */
export async function discoverZone(
  zone: ZoneKey,
  opts: { maxPages: number; fetchImpl?: FetchLike; intervalMs?: number },
): Promise<{ candidates: LeadCandidate[]; skipped: number; reasons: SkipReasons; missingFields: string[]; pages: number; totalResults: number | null; requests: string[] }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const interval = opts.intervalMs ?? MIN_INTERVAL_MS;
  const candidates: LeadCandidate[] = [];
  const requests: string[] = [];
  const reasons = emptyReasons();
  const missing = new Set<string>();
  let skipped = 0;
  let pages = 0;
  let totalResults: number | null = null;

  for (let page = 1; page <= opts.maxPages; page++) {
    const url = buildSireneUrl(zone, page);
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (requests.length > 0 || attempt > 0) await sleep(interval * (attempt + 1));
      requests.push(url);
      response = await doFetch(url, { headers: { Accept: "application/json", "User-Agent": userAgent() }, signal: AbortSignal.timeout(15_000) });
      if (response.status !== 429) break;
    }
    if (!response || !response.ok) throw new Error(`SIRENE ${zone} page ${page} : HTTP ${response?.status ?? "?"}`);
    const mapped = mapSireneResults(await response.json(), zone, new Date());
    candidates.push(...mapped.candidates);
    skipped += mapped.skipped;
    for (const [k, v] of Object.entries(mapped.reasons)) reasons[k as keyof SkipReasons] += v;
    for (const f of mapped.missingFields) missing.add(f);
    totalResults = mapped.totalResults;
    pages++;
    if (page >= mapped.totalPages) break;
  }
  return { candidates, skipped, reasons, missingFields: [...missing].sort(), pages, totalResults, requests };
}
