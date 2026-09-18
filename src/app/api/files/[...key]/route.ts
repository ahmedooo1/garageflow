import { NextResponse } from "next/server";
import { assertSafeKey, getStorage, verifyLocalSignature } from "@/server/lib/storage";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

/**
 * Sert les fichiers du driver de stockage local via une URL signée (HMAC + expiration).
 * Avec le driver S3, les URLs présignées pointent directement vers le bucket.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  try {
    assertSafeKey(key);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = new URL(req.url);
  const exp = url.searchParams.get("exp") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!exp || !sig || !verifyLocalSignature(key, exp, sig)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const photo = await prisma.photo.findUnique({ where: { storageKey: key }, select: { mimeType: true } });
  if (!photo) return new NextResponse("Not found", { status: 404 });
  try {
    const body = await getStorage().get(key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": photo.mimeType,
        "Content-Length": String(body.length),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
