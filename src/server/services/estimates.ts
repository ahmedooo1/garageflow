import { Urgency, type Prisma } from "@prisma/client";
import { z } from "zod";
import { computeLine, computeTotals, formatEur, parseMoneyInput } from "@/lib/pricing";
import { prisma, type Tx } from "@/server/db";
import { assertPermission, type Ctx } from "@/server/context";
import { AppError, ConflictError, NotFoundError } from "@/server/lib/errors";
import { generateToken, sha256 } from "@/server/lib/crypto";
import { optionalId, optionalText, parseOrThrow, requiredText } from "@/server/lib/validation";
import { audit } from "./audit";
import { addEvent } from "./timeline";
import { assertEditable, getOwnedWorkOrder, transitionStatus } from "./workorders";

const moneyField = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const parsed = parseMoneyInput(v === "" ? "0" : v);
      if (!parsed) {
        ctx.addIssue({ code: "custom", message: `${label} : montant invalide` });
        return z.NEVER;
      }
      return parsed;
    });

export const estimateLineSchema = z.object({
  title: requiredText("Titre", 150),
  description: optionalText(2000),
  partsPrice: moneyField("Pièces"),
  laborPrice: moneyField("Main-d'œuvre"),
  vatRate: z
    .string()
    .trim()
    .default("20")
    .transform((v, ctx) => {
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        ctx.addIssue({ code: "custom", message: "Taux de TVA invalide" });
        return z.NEVER;
      }
      return n;
    }),
  urgency: z.nativeEnum(Urgency).default("RECOMMENDED"),
  findingId: optionalId,
});

export type EstimateLineInput = z.input<typeof estimateLineSchema>;

const ESTIMATE_EDITABLE_STATUSES = ["ARRIVED", "WAITING_DIAGNOSIS", "DIAGNOSIS_IN_PROGRESS"] as const;

/** Retourne le brouillon courant du dossier, en le créant si nécessaire. */
export async function getOrCreateDraft(ctx: Ctx, workOrderId: string, tx: Tx | typeof prisma = prisma) {
  const existing = await tx.estimate.findFirst({ where: { workOrderId, garageId: ctx.garageId, status: "DRAFT" } });
  if (existing) return existing;
  const last = await tx.estimate.findFirst({ where: { workOrderId, garageId: ctx.garageId }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (last?.version ?? 0) + 1;
  const created = await tx.estimate.create({ data: { garageId: ctx.garageId, workOrderId, version } });
  await addEvent({ garageId: ctx.garageId, workOrderId, type: "ESTIMATE_CREATED", message: `Estimation v${version} créée`, actorId: ctx.userId }, tx);
  return created;
}

export async function addLine(ctx: Ctx, workOrderId: string, input: EstimateLineInput) {
  assertPermission(ctx, "estimate:write");
  const data = parseOrThrow(estimateLineSchema, input);
  const wo = await getOwnedWorkOrder(ctx, workOrderId);
  assertEditable(wo.status);
  if (!(ESTIMATE_EDITABLE_STATUSES as readonly string[]).includes(wo.status)) {
    throw new ConflictError("Les travaux se proposent pendant le diagnostic. Pour une nouvelle proposition, créez une nouvelle version.");
  }
  if (data.findingId) {
    const f = await prisma.finding.findFirst({ where: { id: data.findingId, workOrderId }, select: { id: true } });
    if (!f) throw new NotFoundError("Constat introuvable");
  }
  const totals = computeLine(data.partsPrice, data.laborPrice, data.vatRate);
  return prisma.$transaction(async (tx) => {
    const estimate = await getOrCreateDraft(ctx, workOrderId, tx);
    const count = await tx.estimateLine.count({ where: { estimateId: estimate.id } });
    const line = await tx.estimateLine.create({
      data: {
        estimateId: estimate.id,
        findingId: data.findingId,
        position: count,
        title: data.title,
        description: data.description,
        partsPrice: data.partsPrice.toFixed(2),
        laborPrice: data.laborPrice.toFixed(2),
        vatRate: data.vatRate.toFixed(2),
        totalHt: totals.totalHt.toFixed(2),
        vatAmount: totals.vatAmount.toFixed(2),
        totalTtc: totals.totalTtc.toFixed(2),
        urgency: data.urgency,
      },
    });
    await addEvent(
      { garageId: ctx.garageId, workOrderId, type: "ESTIMATE_LINE_ADDED", message: `Travaux proposés : ${data.title} – ${formatEur(totals.totalTtc)} TTC`, actorId: ctx.userId },
      tx,
    );
    return line;
  });
}

async function getOwnedLine(ctx: Ctx, lineId: string) {
  const line = await prisma.estimateLine.findFirst({
    where: { id: lineId, estimate: { garageId: ctx.garageId } },
    include: { estimate: { include: { workOrder: { select: { id: true, status: true } } } } },
  });
  if (!line) throw new NotFoundError("Ligne introuvable");
  return line;
}

export async function removeLine(ctx: Ctx, lineId: string) {
  assertPermission(ctx, "estimate:write");
  const line = await getOwnedLine(ctx, lineId);
  if (line.estimate.status !== "DRAFT") throw new ConflictError("Cette estimation a déjà été envoyée : elle ne peut plus être modifiée");
  await prisma.$transaction(async (tx) => {
    await tx.estimateLine.delete({ where: { id: lineId } });
    await addEvent({ garageId: ctx.garageId, workOrderId: line.estimate.workOrderId, type: "ESTIMATE_LINE_REMOVED", message: `Ligne retirée : ${line.title}`, actorId: ctx.userId }, tx);
  });
}

export function approvalTtlMs(): number {
  const hours = Number(process.env.APPROVAL_LINK_TTL_HOURS ?? 72);
  return (Number.isFinite(hours) && hours > 0 ? hours : 72) * 60 * 60 * 1000;
}

async function issueToken(tx: Tx, estimateId: string, userId: string) {
  await tx.approvalToken.updateMany({ where: { estimateId, revokedAt: null }, data: { revokedAt: new Date() } });
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + approvalTtlMs());
  await tx.approvalToken.create({ data: { estimateId, tokenHash: sha256(token), expiresAt, createdById: userId } });
  return { token, expiresAt };
}

export function approvalUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/validation/${token}`;
}

/** Envoie le brouillon au client : verrouille l'estimation et génère le lien sécurisé. */
export async function sendEstimate(ctx: Ctx, workOrderId: string, appUrl: string) {
  assertPermission(ctx, "estimate:send");
  const wo = await getOwnedWorkOrder(ctx, workOrderId);
  assertEditable(wo.status);
  const draft = await prisma.estimate.findFirst({ where: { workOrderId, garageId: ctx.garageId, status: "DRAFT" }, include: { lines: true } });
  if (!draft) throw new AppError("Aucune estimation en brouillon");
  if (draft.lines.length === 0) throw new AppError("Ajoutez au moins une ligne de travaux avant l'envoi");

  return prisma.$transaction(async (tx) => {
    // Une seule estimation « SENT » à la fois : les précédentes deviennent obsolètes.
    const previous = await tx.estimate.findMany({ where: { workOrderId, status: "SENT" }, select: { id: true } });
    for (const p of previous) {
      await tx.estimate.update({ where: { id: p.id }, data: { status: "SUPERSEDED" } });
      await tx.approvalToken.updateMany({ where: { estimateId: p.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await tx.estimate.update({ where: { id: draft.id }, data: { status: "SENT", sentAt: new Date() } });
    const { token, expiresAt } = await issueToken(tx, draft.id, ctx.userId);

    let current = { id: wo.id, status: wo.status };
    if (current.status === "ARRIVED" || current.status === "WAITING_DIAGNOSIS") {
      await transitionStatus(tx, ctx, current, "DIAGNOSIS_IN_PROGRESS", { type: "STATUS_CHANGED", message: "Diagnostic commencé" });
      current = { ...current, status: "DIAGNOSIS_IN_PROGRESS" };
    }
    if (current.status !== "WAITING_CUSTOMER_APPROVAL") {
      await transitionStatus(tx, ctx, current, "WAITING_CUSTOMER_APPROVAL", {
        type: "ESTIMATE_SENT",
        message: `Validation envoyée au client (estimation v${draft.version}, ${draft.lines.length} ligne${draft.lines.length > 1 ? "s" : ""})`,
      });
    } else {
      await addEvent({ garageId: ctx.garageId, workOrderId, type: "ESTIMATE_SENT", message: `Validation envoyée au client (estimation v${draft.version})`, actorId: ctx.userId }, tx);
    }
    await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "estimate.send", entityType: "Estimate", entityId: draft.id, ip: ctx.ip, metadata: { version: draft.version } }, tx);
    return { estimateId: draft.id, token, expiresAt, url: approvalUrl(appUrl, token) };
  });
}

/** Génère un nouveau lien (révoque les précédents) pour une estimation envoyée. */
export async function regenerateLink(ctx: Ctx, estimateId: string, appUrl: string) {
  assertPermission(ctx, "estimate:send");
  const estimate = await prisma.estimate.findFirst({ where: { id: estimateId, garageId: ctx.garageId } });
  if (!estimate) throw new NotFoundError("Estimation introuvable");
  if (estimate.status !== "SENT") throw new ConflictError("Seule une estimation en attente de décision peut recevoir un nouveau lien");
  return prisma.$transaction(async (tx) => {
    const { token, expiresAt } = await issueToken(tx, estimateId, ctx.userId);
    await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "estimate.link_regenerated", entityType: "Estimate", entityId: estimateId, ip: ctx.ip }, tx);
    return { token, expiresAt, url: approvalUrl(appUrl, token) };
  });
}

/**
 * Remplace une estimation envoyée (non décidée) par un nouveau brouillon
 * copiant ses lignes. L'ancienne version est conservée telle quelle.
 */
export async function reviseEstimate(ctx: Ctx, estimateId: string) {
  assertPermission(ctx, "estimate:write");
  const estimate = await prisma.estimate.findFirst({ where: { id: estimateId, garageId: ctx.garageId }, include: { lines: { orderBy: { position: "asc" } }, workOrder: true } });
  if (!estimate) throw new NotFoundError("Estimation introuvable");
  if (estimate.status !== "SENT") throw new ConflictError("Seule une estimation en attente peut être révisée");
  return prisma.$transaction(async (tx) => {
    await tx.estimate.update({ where: { id: estimateId }, data: { status: "SUPERSEDED" } });
    await tx.approvalToken.updateMany({ where: { estimateId, revokedAt: null }, data: { revokedAt: new Date() } });
    const draft = await tx.estimate.create({ data: { garageId: ctx.garageId, workOrderId: estimate.workOrderId, version: estimate.version + 1 } });
    if (estimate.lines.length > 0) {
      await tx.estimateLine.createMany({
        data: estimate.lines.map((l) => ({
          estimateId: draft.id,
          findingId: l.findingId,
          position: l.position,
          title: l.title,
          description: l.description,
          partsPrice: l.partsPrice,
          laborPrice: l.laborPrice,
          vatRate: l.vatRate,
          totalHt: l.totalHt,
          vatAmount: l.vatAmount,
          totalTtc: l.totalTtc,
          urgency: l.urgency,
        })),
      });
    }
    if (estimate.workOrder.status === "WAITING_CUSTOMER_APPROVAL") {
      await transitionStatus(tx, ctx, estimate.workOrder, "DIAGNOSIS_IN_PROGRESS", {
        type: "ESTIMATE_SUPERSEDED",
        message: `Estimation v${estimate.version} remplacée par un brouillon v${draft.version}`,
      });
    } else {
      await addEvent({ garageId: ctx.garageId, workOrderId: estimate.workOrderId, type: "ESTIMATE_SUPERSEDED", message: `Estimation v${estimate.version} remplacée par v${draft.version}`, actorId: ctx.userId }, tx);
    }
    await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "estimate.revise", entityType: "Estimate", entityId: estimateId, ip: ctx.ip }, tx);
    return draft;
  });
}

export async function setLineWorkStatus(ctx: Ctx, lineId: string, done: boolean) {
  assertPermission(ctx, "repair:transition");
  const line = await getOwnedLine(ctx, lineId);
  if (line.decision !== "ACCEPTED") throw new ConflictError("Seuls les travaux acceptés peuvent être réalisés");
  const status = line.estimate.workOrder.status;
  if (status !== "REPAIR_IN_PROGRESS" && status !== "QUALITY_CONTROL" && status !== "WAITING_PARTS") {
    throw new ConflictError("Les travaux se cochent pendant la réparation");
  }
  await prisma.$transaction(async (tx) => {
    await tx.estimateLine.update({ where: { id: lineId }, data: { workStatus: done ? "DONE" : "TODO" } });
    if (done) {
      await addEvent({ garageId: ctx.garageId, workOrderId: line.estimate.workOrderId, type: "LINE_COMPLETED", message: `Travaux réalisés : ${line.title}`, actorId: ctx.userId }, tx);
    }
  });
}

export function estimateTotals(estimate: { lines: { totalHt: Prisma.Decimal; vatAmount: Prisma.Decimal; totalTtc: Prisma.Decimal; decision: "PENDING" | "ACCEPTED" | "REFUSED" }[] }) {
  return computeTotals(
    estimate.lines.map((l) => ({ totalHt: l.totalHt.toString(), vatAmount: l.vatAmount.toString(), totalTtc: l.totalTtc.toString(), decision: l.decision })),
  );
}
