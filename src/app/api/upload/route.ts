import { NextResponse } from "next/server";
import { InvalidTransitionError } from "@/lib/state-machine";
import { requireCtx } from "@/server/context";
import { isAppError } from "@/server/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/lib/rate-limit";
import { getAppUrl, getClientIp } from "@/server/lib/request";
import { addPhoto, MAX_UPLOAD_BYTES, type PhotoMetaInput } from "@/server/services/photos";

export const runtime = "nodejs";

/** Vérifie que la requête vient bien de notre origine (protection CSRF). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  try {
    const o = new URL(origin);
    if (o.host === host) return true;
    return o.origin === new URL(getAppUrl()).origin;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
    const { ctx } = await requireCtx("diagnosis:write");
    ctx.ip = await getClientIp();
    enforceRateLimit(`upload:${ctx.userId}`, RATE_LIMITS.upload);

    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (10 Mo maximum)" }, { status: 413 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const workOrderId = form.get("workOrderId");
    if (!(file instanceof File) || typeof workOrderId !== "string") {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Fichier trop volumineux (10 Mo maximum)" }, { status: 413 });
    }
    const meta: PhotoMetaInput = {
      type: (form.get("type") as PhotoMetaInput["type"]) ?? "OTHER",
      comment: typeof form.get("comment") === "string" ? (form.get("comment") as string) : "",
      findingId: (form.get("findingId") as string | null) ?? undefined,
      damageId: (form.get("damageId") as string | null) ?? undefined,
      checklistId: (form.get("checklistId") as string | null) ?? undefined,
    };
    const buffer = Buffer.from(await file.arrayBuffer());
    const photo = await addPhoto(ctx, workOrderId, buffer, meta);
    return NextResponse.json({ ok: true, id: photo.id });
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message, fields: "fields" in e ? e.fields : undefined }, { status: e.status });
    if (e instanceof InvalidTransitionError) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("[upload]", e);
    return NextResponse.json({ error: "Erreur lors de l'envoi de la photo" }, { status: 500 });
  }
}
