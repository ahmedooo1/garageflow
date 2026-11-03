import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/server/lib/rate-limit";
import { getAppUrl } from "@/server/lib/request";
import { classifySource, isBot, recordPageView } from "@/server/growth/audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Comptage de pages vues, sans cookie ni stockage d'IP : l'adresse sert
 * seulement de clé au limiteur en mémoire, puis est oubliée.
 */
export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
  if (isBot(ua) || request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1") return new NextResponse(null, { status: 204 });
  if (!checkRateLimit(`audience:${ip}`, RATE_LIMITS.audience).ok) return new NextResponse(null, { status: 204 });
  try {
    const body = (await request.json()) as { path?: unknown; referrer?: unknown; utmSource?: unknown };
    const path = typeof body.path === "string" ? body.path.slice(0, 100) : "";
    const ownHost = new URL(getAppUrl()).hostname;
    const source = classifySource({ referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 300) : "", utmSource: typeof body.utmSource === "string" ? body.utmSource : "" }, ownHost);
    await recordPageView(path, source);
  } catch {
    // Mesure au mieux : une requête mal formée n'est simplement pas comptée.
  }
  return new NextResponse(null, { status: 204 });
}
