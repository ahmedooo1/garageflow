import { sanitizeSource } from "@/lib/growth/normalize";
import { prisma } from "@/server/db";

/**
 * Mesure d'audience exemptée de consentement (recommandations CNIL) : comptage
 * agrégé par jour, page et provenance. Aucun cookie, aucune adresse IP, aucun
 * identifiant, aucun croisement avec d'autres données.
 */

export const TRACKED_PATHS = ["/", "/register", "/login", "/cgu", "/confidentialite"] as const;

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|httpclient/i;

export function isBot(userAgent: string): boolean {
  return !userAgent || BOT.test(userAgent);
}

/** Provenance : utm_source si présent, sinon domaine référent externe, sinon « direct ». */
export function classifySource(input: { utmSource?: string; referrer?: string }, ownHost: string): string {
  const utm = sanitizeSource(input.utmSource ?? "");
  if (utm) return `utm:${utm}`;
  try {
    const host = new URL(input.referrer ?? "").hostname.replace(/^www\./, "");
    if (host && host !== ownHost.replace(/^www\./, "")) return sanitizeSource(host) || "direct";
  } catch {
    // Pas de référent exploitable.
  }
  return "direct";
}

export async function recordPageView(path: string, source: string, now = new Date()): Promise<boolean> {
  if (!(TRACKED_PATHS as readonly string[]).includes(path)) return false;
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  await prisma.pageView.upsert({
    where: { day_path_source: { day, path, source } },
    create: { day, path, source, count: 1 },
    update: { count: { increment: 1 } },
  });
  return true;
}
