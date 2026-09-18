import type { CheckStatus, DamageType, EstimateStatus, LineDecision, Urgency, WorkStatus } from "@prisma/client";
import { CHECKLIST_ITEMS } from "@/lib/labels";
import { estimateTotals } from "@/server/services/estimates";
import type { WorkOrderDetail } from "@/server/services/workorders";

/** Modèles de vue sérialisables (pas de Decimal) pour les composants client. */

export type LineView = {
  id: string;
  title: string;
  description: string;
  partsPrice: string;
  laborPrice: string;
  vatRate: string;
  totalHt: string;
  vatAmount: string;
  totalTtc: string;
  urgency: Urgency;
  decision: LineDecision;
  workStatus: WorkStatus;
  findingId: string | null;
};

export type EstimateView = {
  id: string;
  version: number;
  status: EstimateStatus;
  sentAt: Date | null;
  decidedAt: Date | null;
  lines: LineView[];
  totals: {
    totalHt: string;
    vatAmount: string;
    totalTtc: string;
    acceptedTtc: string;
    refusedTtc: string;
    pendingTtc: string;
    acceptedCount: number;
    refusedCount: number;
  };
  approval: { decidedAt: Date; acceptedTotal: string; refusedTotal: string; customerName: string; comment: string } | null;
  activeToken: { expiresAt: Date; usedAt: Date | null } | null;
};

export type FindingView = {
  id: string;
  title: string;
  category: string;
  description: string;
  urgency: Urgency;
  authorName: string;
  createdAt: Date;
};

export type ChecklistView = {
  id: string | null;
  key: string;
  label: string;
  section: string;
  status: CheckStatus;
  comment: string;
};

export type DamageView = {
  id: string;
  type: DamageType;
  location: string;
  description: string;
  createdAt: Date;
};

export function toEstimateViews(wo: WorkOrderDetail): EstimateView[] {
  return wo.estimates.map((e) => {
    const totals = estimateTotals(e);
    const active = e.tokens.find((t) => !t.revokedAt && t.expiresAt.getTime() > Date.now()) ?? null;
    return {
      id: e.id,
      version: e.version,
      status: e.status,
      sentAt: e.sentAt,
      decidedAt: e.decidedAt,
      lines: e.lines.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        partsPrice: l.partsPrice.toString(),
        laborPrice: l.laborPrice.toString(),
        vatRate: l.vatRate.toString(),
        totalHt: l.totalHt.toString(),
        vatAmount: l.vatAmount.toString(),
        totalTtc: l.totalTtc.toString(),
        urgency: l.urgency,
        decision: l.decision,
        workStatus: l.workStatus,
        findingId: l.findingId,
      })),
      totals: {
        totalHt: totals.totalHt.toString(),
        vatAmount: totals.vatAmount.toString(),
        totalTtc: totals.totalTtc.toString(),
        acceptedTtc: totals.acceptedTtc.toString(),
        refusedTtc: totals.refusedTtc.toString(),
        pendingTtc: totals.pendingTtc.toString(),
        acceptedCount: totals.acceptedCount,
        refusedCount: totals.refusedCount,
      },
      approval: e.approval
        ? {
            decidedAt: e.approval.decidedAt,
            acceptedTotal: e.approval.acceptedTotal.toString(),
            refusedTotal: e.approval.refusedTotal.toString(),
            customerName: e.approval.customerName,
            comment: e.approval.comment,
          }
        : null,
      activeToken: active ? { expiresAt: active.expiresAt, usedAt: active.usedAt } : null,
    };
  });
}

export function toFindingViews(wo: WorkOrderDetail): FindingView[] {
  return wo.findings.map((f) => ({
    id: f.id,
    title: f.title,
    category: f.category,
    description: f.description,
    urgency: f.urgency,
    authorName: `${f.author.firstName} ${f.author.lastName}`,
    createdAt: f.createdAt,
  }));
}

export function toChecklistViews(wo: WorkOrderDetail): ChecklistView[] {
  return CHECKLIST_ITEMS.map((def) => {
    const item = wo.checklist.find((c) => c.key === def.key);
    return { id: item?.id ?? null, key: def.key, label: def.label, section: def.section, status: item?.status ?? "NOT_CHECKED", comment: item?.comment ?? "" };
  });
}

export function toDamageViews(wo: WorkOrderDetail): DamageView[] {
  return wo.damages.map((d) => ({ id: d.id, type: d.type, location: d.location, description: d.description, createdAt: d.createdAt }));
}
