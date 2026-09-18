import type { LineDecision, WorkOrderStatus } from "@prisma/client";
import { z } from "zod";
import { formatEur } from "@/lib/pricing";
import { prisma } from "@/server/db";
import { sha256 } from "@/server/lib/crypto";
import { AppError, ConflictError, NotFoundError } from "@/server/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/lib/rate-limit";
import { SIGNED_URL_TTL_SECONDS, getStorage } from "@/server/lib/storage";
import { optionalText, parseOrThrow } from "@/server/lib/validation";
import { audit } from "./audit";
import { estimateTotals } from "./estimates";
import { transitionStatus } from "./workorders";

const PORTAL_PHOTO_TYPES = ["FRONT", "REAR", "LEFT", "RIGHT", "INTERIOR", "DASHBOARD", "FINDING", "DAMAGE"] as const;

/** Résout un jeton public : lève NotFound s'il est inconnu, révoqué ou expiré. */
async function resolveToken(rawToken: string) {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200 || !/^[A-Za-z0-9_-]+$/.test(rawToken)) {
    throw new NotFoundError("Lien invalide");
  }
  const token = await prisma.approvalToken.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: {
      estimate: {
        include: {
          lines: { orderBy: { position: "asc" }, include: { finding: { select: { id: true, title: true, urgency: true } } } },
          approval: true,
          workOrder: {
            include: {
              garage: { select: { name: true, address: true, phone: true, email: true } },
              vehicle: { select: { plate: true, make: true, model: true, year: true } },
              customer: { select: { firstName: true, lastName: true } },
              findings: { orderBy: { createdAt: "asc" }, include: { photos: true } },
              photos: { where: { type: { in: [...PORTAL_PHOTO_TYPES] } }, orderBy: { createdAt: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!token || token.revokedAt || token.expiresAt.getTime() < Date.now()) {
    throw new NotFoundError("Ce lien est invalide ou a expiré. Contactez votre garage.");
  }
  return token;
}

export type PortalData = Awaited<ReturnType<typeof getPortalData>>;

/** Données affichées au client (sans aucun identifiant interne sensible). */
export async function getPortalData(rawToken: string, ip: string) {
  enforceRateLimit(`portal:${ip}`, RATE_LIMITS.portal);
  const token = await resolveToken(rawToken);
  const { estimate } = token;
  const { workOrder } = estimate;
  const storage = getStorage();
  const photos = await Promise.all(
    workOrder.photos.map(async (p) => ({
      id: p.id,
      type: p.type,
      comment: p.comment,
      findingId: p.findingId,
      url: await storage.signedUrl(p.storageKey, SIGNED_URL_TTL_SECONDS),
    })),
  );
  const totals = estimateTotals(estimate);
  return {
    garage: workOrder.garage,
    vehicle: workOrder.vehicle,
    customer: workOrder.customer,
    workOrderNumber: workOrder.number,
    mileageIn: workOrder.mileageIn,
    reason: workOrder.reason,
    estimate: {
      id: estimate.id,
      version: estimate.version,
      status: estimate.status,
      note: estimate.note,
      sentAt: estimate.sentAt,
      decidedAt: estimate.decidedAt,
      lines: estimate.lines.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        urgency: l.urgency,
        partsPrice: l.partsPrice.toString(),
        laborPrice: l.laborPrice.toString(),
        vatRate: l.vatRate.toString(),
        totalHt: l.totalHt.toString(),
        vatAmount: l.vatAmount.toString(),
        totalTtc: l.totalTtc.toString(),
        decision: l.decision,
        findingTitle: l.finding?.title ?? null,
      })),
      totals: {
        totalHt: totals.totalHt.toString(),
        vatAmount: totals.vatAmount.toString(),
        totalTtc: totals.totalTtc.toString(),
        acceptedTtc: totals.acceptedTtc.toString(),
        refusedTtc: totals.refusedTtc.toString(),
      },
      approval: estimate.approval
        ? { decidedAt: estimate.approval.decidedAt, acceptedTotal: estimate.approval.acceptedTotal.toString(), customerName: estimate.approval.customerName }
        : null,
    },
    findings: workOrder.findings.map((f) => ({ id: f.id, title: f.title, category: f.category, description: f.description, urgency: f.urgency })),
    photos,
    expiresAt: token.expiresAt,
  };
}

export const decisionSchema = z.object({
  decisions: z.record(z.string().min(1).max(64), z.enum(["ACCEPTED", "REFUSED"])),
  customerName: z.string().trim().max(120).default(""),
  comment: optionalText(1000),
});

export type DecisionInput = z.input<typeof decisionSchema>;

/**
 * Enregistre la décision du client ligne par ligne. Une estimation déjà
 * décidée est immuable : toute nouvelle soumission est rejetée.
 */
export async function submitDecision(rawToken: string, input: DecisionInput, meta: { ip: string; userAgent: string }) {
  enforceRateLimit(`portal-decision:${meta.ip}`, RATE_LIMITS.portalDecision);
  const data = parseOrThrow(decisionSchema, input);
  const token = await resolveToken(rawToken);
  const { estimate } = token;
  if (estimate.status === "DECIDED" || estimate.approval) throw new ConflictError("Cette proposition a déjà été validée et ne peut plus être modifiée");
  if (estimate.status !== "SENT") throw new ConflictError("Cette proposition n'est plus valable");

  const lineIds = new Set(estimate.lines.map((l) => l.id));
  for (const id of lineIds) {
    if (!data.decisions[id]) throw new AppError("Merci d'indiquer votre choix pour chaque intervention");
  }
  for (const id of Object.keys(data.decisions)) {
    if (!lineIds.has(id)) throw new AppError("Décision invalide");
  }

  const decidedAt = new Date();
  const decidedLines = estimate.lines.map((l) => ({ ...l, decision: data.decisions[l.id] as LineDecision }));
  const totals = estimateTotals({ lines: decidedLines });
  const total = estimate.lines.length;
  let nextStatus: WorkOrderStatus;
  if (totals.acceptedCount === total) nextStatus = "APPROVED";
  else if (totals.acceptedCount > 0) nextStatus = "PARTIALLY_APPROVED";
  else nextStatus = "READY_FOR_PICKUP";

  const workOrder = estimate.workOrder;
  await prisma.$transaction(async (tx) => {
    // Verrou optimiste : l'UPDATE échoue si une autre décision est passée entre-temps.
    const locked = await tx.estimate.updateMany({ where: { id: estimate.id, status: "SENT" }, data: { status: "DECIDED", decidedAt } });
    if (locked.count !== 1) throw new ConflictError("Cette proposition a déjà été validée");
    for (const line of decidedLines) {
      await tx.estimateLine.update({ where: { id: line.id }, data: { decision: line.decision } });
    }
    await tx.approval.create({
      data: {
        garageId: workOrder.garageId,
        estimateId: estimate.id,
        acceptedTotal: totals.acceptedTtc.toFixed(2),
        refusedTotal: totals.refusedTtc.toFixed(2),
        acceptedCount: totals.acceptedCount,
        refusedCount: totals.refusedCount,
        customerName: data.customerName,
        comment: data.comment,
        ip: meta.ip,
        userAgent: meta.userAgent,
        decidedAt,
        snapshot: {
          version: estimate.version,
          lines: decidedLines.map((l) => ({ id: l.id, title: l.title, totalTtc: l.totalTtc.toString(), decision: l.decision })),
        },
      },
    });
    await tx.approvalToken.update({ where: { id: token.id }, data: { usedAt: decidedAt } });
    const accepted = decidedLines.filter((l) => l.decision === "ACCEPTED").map((l) => l.title);
    const refused = decidedLines.filter((l) => l.decision === "REFUSED").map((l) => l.title);
    const message =
      `Le client a répondu (v${estimate.version}) : ${totals.acceptedCount} accepté${totals.acceptedCount > 1 ? "s" : ""}` +
      (accepted.length ? ` (${accepted.join(", ")})` : "") +
      `, ${totals.refusedCount} refusé${totals.refusedCount > 1 ? "s" : ""}` +
      (refused.length ? ` (${refused.join(", ")})` : "") +
      ` – montant accepté ${formatEur(totals.acceptedTtc)} TTC`;
    if (workOrder.status === "WAITING_CUSTOMER_APPROVAL") {
      await transitionStatus(tx, { garageId: workOrder.garageId, userId: null }, workOrder, nextStatus, {
        type: "CUSTOMER_DECISION",
        message,
        actorLabel: data.customerName || "Client",
        payload: { from: workOrder.status, to: nextStatus, acceptedTotal: totals.acceptedTtc.toString(), decisions: data.decisions },
      });
    }
    await audit(
      {
        garageId: workOrder.garageId,
        action: "approval.decision",
        entityType: "Estimate",
        entityId: estimate.id,
        ip: meta.ip,
        metadata: { acceptedCount: totals.acceptedCount, refusedCount: totals.refusedCount, acceptedTotal: totals.acceptedTtc.toString() },
      },
      tx,
    );
  });
  return { nextStatus, acceptedTotal: totals.acceptedTtc, acceptedCount: totals.acceptedCount, refusedCount: totals.refusedCount };
}
