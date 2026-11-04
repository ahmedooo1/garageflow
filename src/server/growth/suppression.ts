import type { SuppressionKind } from "@prisma/client";
import { emailDomain, isWebmailDomain, normalizeEmail, normalizeSiret } from "@/lib/growth/normalize";
import { prisma, type Tx } from "@/server/db";
import { AppError } from "@/server/lib/errors";
import { assertPlatformActor } from "@/server/services/platform";

/**
 * Liste d'opposition. Elle ne contient que l'identifiant à exclure (email,
 * domaine ou SIRET) et le motif : c'est la seule donnée conservée après une
 * opposition, pour pouvoir la respecter durablement.
 */

export function normalizeSuppression(kind: SuppressionKind, value: string): string {
  if (kind === "EMAIL") return normalizeEmail(value);
  if (kind === "SIRET") return normalizeSiret(value);
  const domain = value.trim().toLowerCase().replace(/^@/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : "";
}

export async function addSuppression(
  kind: SuppressionKind,
  rawValue: string,
  meta: { reason?: string; origin: string },
  tx: Tx | typeof prisma = prisma,
): Promise<boolean> {
  const value = normalizeSuppression(kind, rawValue);
  if (!value) return false;
  if (kind === "DOMAIN" && isWebmailDomain(value)) throw new AppError("Un domaine de messagerie grand public ne peut pas être exclu en bloc");
  await tx.suppressionEntry.upsert({
    where: { kind_value: { kind, value } },
    create: { kind, value, reason: (meta.reason ?? "").slice(0, 300), origin: meta.origin },
    update: {},
  });
  return true;
}

/** Vrai si l'email, son domaine (hors messageries grand public) ou le SIRET est exclu. */
export async function isSuppressed(target: { email?: string; siret?: string | null }, tx: Tx | typeof prisma = prisma): Promise<boolean> {
  const or: { kind: SuppressionKind; value: string }[] = [];
  const email = normalizeEmail(target.email ?? "");
  if (email) {
    or.push({ kind: "EMAIL", value: email });
    const domain = emailDomain(email);
    if (domain && !isWebmailDomain(domain)) or.push({ kind: "DOMAIN", value: domain });
  }
  const siret = normalizeSiret(target.siret ?? "");
  if (siret) or.push({ kind: "SIRET", value: siret });
  if (or.length === 0) return false;
  return (await tx.suppressionEntry.count({ where: { OR: or } })) > 0;
}

export async function listSuppressions(actorId: string, take = 200) {
  await assertPlatformActor(actorId);
  return prisma.suppressionEntry.findMany({ orderBy: { createdAt: "desc" }, take });
}
