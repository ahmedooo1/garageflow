import { randomUUID } from "node:crypto";
import { PhotoType, type Photo } from "@prisma/client";
import { fileTypeFromBuffer } from "file-type";
import sharp, { type OutputInfo } from "sharp";
import { z } from "zod";
import { PHOTO_TYPE_LABELS } from "@/lib/labels";
import { prisma } from "@/server/db";
import { assertPermission, type Ctx } from "@/server/context";
import { AppError, NotFoundError } from "@/server/lib/errors";
import { getStorage, SIGNED_URL_TTL_SECONDS } from "@/server/lib/storage";
import { optionalId, optionalText, parseOrThrow } from "@/server/lib/validation";
import { addEvent } from "./timeline";
import { assertEditable, getOwnedWorkOrder } from "./workorders";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_DIMENSION = 2000;

export const photoMetaSchema = z.object({
  type: z.nativeEnum(PhotoType).default("OTHER"),
  comment: optionalText(500),
  findingId: optionalId,
  damageId: optionalId,
  checklistId: optionalId,
});

export type PhotoMetaInput = z.input<typeof photoMetaSchema>;

/**
 * Valide (taille, type réel), ré-encode (sharp : rotation EXIF, redimension,
 * métadonnées supprimées) puis stocke une photo et crée l'enregistrement.
 */
export async function addPhoto(ctx: Ctx, workOrderId: string, file: Buffer, meta: PhotoMetaInput): Promise<Photo> {
  assertPermission(ctx, "diagnosis:write");
  const data = parseOrThrow(photoMetaSchema, meta);
  if (file.length === 0) throw new AppError("Fichier vide");
  if (file.length > MAX_UPLOAD_BYTES) throw new AppError("Fichier trop volumineux (10 Mo maximum)");

  const detected = await fileTypeFromBuffer(file);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw new AppError("Format non supporté : utilisez JPEG, PNG, WebP ou AVIF");
  }

  const wo = await getOwnedWorkOrder(ctx, workOrderId);
  assertEditable(wo.status);

  if (data.findingId) {
    const f = await prisma.finding.findFirst({ where: { id: data.findingId, workOrderId }, select: { id: true } });
    if (!f) throw new NotFoundError("Constat introuvable");
  }
  if (data.damageId) {
    const d = await prisma.damage.findFirst({ where: { id: data.damageId, workOrderId }, select: { id: true } });
    if (!d) throw new NotFoundError("Dommage introuvable");
  }
  if (data.checklistId) {
    const c = await prisma.checklistItem.findFirst({ where: { id: data.checklistId, workOrderId }, select: { id: true } });
    if (!c) throw new NotFoundError("Élément de contrôle introuvable");
  }

  let processed: { data: Buffer; info: OutputInfo };
  try {
    processed = await sharp(file, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new AppError("Image illisible ou corrompue");
  }

  const storageKey = `garages/${ctx.garageId}/${workOrderId}/${randomUUID()}.jpg`;
  await getStorage().put(storageKey, processed.data, "image/jpeg");

  return prisma.$transaction(async (tx) => {
    const photo = await tx.photo.create({
      data: {
        garageId: ctx.garageId,
        workOrderId,
        type: data.type,
        storageKey,
        mimeType: "image/jpeg",
        size: processed.data.length,
        width: processed.info.width,
        height: processed.info.height,
        comment: data.comment,
        authorId: ctx.userId,
        findingId: data.findingId,
        damageId: data.damageId,
        checklistId: data.checklistId,
      },
    });
    await addEvent(
      { garageId: ctx.garageId, workOrderId, type: "PHOTO_ADDED", message: `Photo ajoutée : ${PHOTO_TYPE_LABELS[data.type]}${data.comment ? " – " + data.comment : ""}`, actorId: ctx.userId },
      tx,
    );
    return photo;
  });
}

export async function deletePhoto(ctx: Ctx, photoId: string): Promise<void> {
  assertPermission(ctx, "diagnosis:write");
  const photo = await prisma.photo.findFirst({ where: { id: photoId, garageId: ctx.garageId }, include: { workOrder: { select: { status: true } } } });
  if (!photo) throw new NotFoundError("Photo introuvable");
  assertEditable(photo.workOrder.status);
  await prisma.photo.delete({ where: { id: photoId } });
  await getStorage().remove(photo.storageKey);
}

export type PhotoView = {
  id: string;
  type: PhotoType;
  comment: string;
  createdAt: Date;
  authorName: string;
  url: string;
  width: number | null;
  height: number | null;
  findingId: string | null;
  damageId: string | null;
  checklistId: string | null;
};

export async function toPhotoViews(
  photos: (Photo & { author?: { firstName: string; lastName: string } | null })[],
): Promise<PhotoView[]> {
  const storage = getStorage();
  return Promise.all(
    photos.map(async (p) => ({
      id: p.id,
      type: p.type,
      comment: p.comment,
      createdAt: p.createdAt,
      authorName: p.author ? `${p.author.firstName} ${p.author.lastName}` : "",
      url: await storage.signedUrl(p.storageKey, SIGNED_URL_TTL_SECONDS),
      width: p.width,
      height: p.height,
      findingId: p.findingId,
      damageId: p.damageId,
      checklistId: p.checklistId,
    })),
  );
}
