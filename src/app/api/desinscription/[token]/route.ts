import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/server/lib/rate-limit";
import { getAppUrl } from "@/server/lib/request";
import { processUnsubscribe } from "@/server/growth/outreach";

export const runtime = "nodejs";

/**
 * Désinscription en un clic (RFC 8058, en-tête List-Unsubscribe-Post) et
 * formulaire de la page /desinscription. Aucune connexion requise.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
  if (!checkRateLimit(`unsubscribe:${ip}`, RATE_LIMITS.unsubscribe).ok) return NextResponse.json({ error: "Trop de tentatives" }, { status: 429 });
  const ok = await processUnsubscribe(token);
  const fromForm = request.nextUrl.searchParams.get("form") === "1";
  if (fromForm) return NextResponse.redirect(`${getAppUrl()}/desinscription/${encodeURIComponent(token)}?${ok ? "ok=1" : "erreur=1"}`, 303);
  return ok ? new NextResponse(null, { status: 200 }) : NextResponse.json({ error: "Lien invalide" }, { status: 400 });
}
