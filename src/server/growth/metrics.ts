import type { LeadStage } from "@prisma/client";
import { LEAD_STAGES } from "@/lib/growth/labels";
import { PLANS } from "@/lib/plans";
import { prisma } from "@/server/db";
import { monthlySpendMicroUsd } from "./ai";

/**
 * Indicateurs calculés uniquement depuis la base : rien n'est estimé ni
 * extrapolé. Un taux sans dénominateur vaut null (affiché « - »).
 * Les garages de l'équipe GarageFlow (comptes plateforme) sont exclus.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type Rate = { num: number; den: number; value: number | null };
const rate = (num: number, den: number): Rate => ({ num, den, value: den > 0 ? num / den : null });

/** Étapes considérées comme « contacté ou plus loin » pour le taux de réponse. */
const CONTACTED_OR_LATER: LeadStage[] = ["CONTACTED", "REPLIED", "DEMO_BOOKED", "TRIAL", "CONVERTED", "NOT_INTERESTED"];
const REPLIED_OR_LATER: LeadStage[] = ["REPLIED", "DEMO_BOOKED", "TRIAL", "CONVERTED", "NOT_INTERESTED"];

export async function growthMetrics(now = new Date()) {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const customerGarage = { users: { none: { platformAdmin: true } } };

  const [views, viewsByPath, viewsBySource] = await Promise.all([
    prisma.pageView.aggregate({ where: { day: { gte: since30 } }, _sum: { count: true } }),
    prisma.pageView.groupBy({ by: ["path"], where: { day: { gte: since30 } }, _sum: { count: true } }),
    prisma.pageView.groupBy({ by: ["source"], where: { day: { gte: since30 } }, _sum: { count: true } }),
  ]);

  const [signups30, signupsAll, bySignupSource, activated, trialEnded, paidAfterTrial, active, pastDue, canceled, activeByPlan] = await Promise.all([
    prisma.garage.count({ where: { ...customerGarage, createdAt: { gte: since30 } } }),
    prisma.garage.count({ where: customerGarage }),
    prisma.garage.groupBy({ by: ["acquisitionSource"], where: customerGarage, _count: true }),
    prisma.garage.count({ where: { ...customerGarage, workOrders: { some: {} } } }),
    // Essais arrivés à échéance, ou garages déjà passés à un abonnement.
    prisma.garage.count({ where: { ...customerGarage, OR: [{ trialEndsAt: { lt: now } }, { subscriptionStatus: { in: ["ACTIVE", "PAST_DUE", "CANCELED"] } }] } }),
    prisma.garage.count({ where: { ...customerGarage, subscriptionStatus: { in: ["ACTIVE", "PAST_DUE"] } } }),
    prisma.garage.count({ where: { ...customerGarage, subscriptionStatus: "ACTIVE" } }),
    prisma.garage.count({ where: { ...customerGarage, subscriptionStatus: "PAST_DUE" } }),
    prisma.garage.count({ where: { ...customerGarage, subscriptionStatus: "CANCELED" } }),
    prisma.garage.groupBy({ by: ["plan"], where: { ...customerGarage, subscriptionStatus: "ACTIVE" }, _count: true }),
  ]);
  const mrrHt = activeByPlan.reduce((sum, p) => sum + PLANS[p.plan].priceHt * p._count, 0);
  const everPaid = active + pastDue + canceled;

  const [byStage, bySource, byZone, demoRequests30, sent30, pendingReview, contacted, replied, leadsWithTrial] = await Promise.all([
    prisma.lead.groupBy({ by: ["stage"], _count: true }),
    prisma.lead.groupBy({ by: ["source"], _count: true }),
    prisma.lead.groupBy({ by: ["zone"], _count: true }),
    prisma.lead.count({ where: { demoRequestedAt: { gte: since30 } } }),
    prisma.outreachDraft.count({ where: { status: "SENT", sentAt: { gte: since30 } } }),
    prisma.outreachDraft.count({ where: { status: { in: ["DRAFT", "APPROVED"] } } }),
    prisma.lead.count({ where: { stage: { in: CONTACTED_OR_LATER }, lastContactedAt: { not: null } } }),
    prisma.lead.count({ where: { stage: { in: REPLIED_OR_LATER }, lastContactedAt: { not: null } } }),
    prisma.lead.count({ where: { garageId: { not: null } } }),
  ]);
  const stageCounts = Object.fromEntries(LEAD_STAGES.map((s) => [s, byStage.find((b) => b.stage === s)?._count ?? 0])) as Record<LeadStage, number>;

  return {
    traffic: {
      views30: views._sum.count ?? 0,
      byPath: viewsByPath.map((v) => ({ path: v.path, count: v._sum.count ?? 0 })).sort((a, b) => b.count - a.count),
      bySource: viewsBySource.map((v) => ({ source: v.source, count: v._sum.count ?? 0 })).sort((a, b) => b.count - a.count).slice(0, 10),
    },
    product: {
      signups30,
      signupsAll,
      bySignupSource: bySignupSource.map((s) => ({ source: s.acquisitionSource || "non renseignée", count: s._count })).sort((a, b) => b.count - a.count),
      activation: rate(activated, signupsAll),
      trialToPaid: rate(paidAfterTrial, trialEnded),
      active,
      pastDue,
      canceled,
      churn: rate(canceled, everPaid),
      mrrHt,
    },
    sales: {
      stageCounts,
      bySource: bySource.map((s) => ({ source: s.source, count: s._count })),
      byZone: byZone.map((z) => ({ zone: z.zone, count: z._count })),
      demoRequests30,
      sent30,
      pendingReview,
      replyRate: rate(replied, contacted),
      leadsWithTrial,
      leadToTrial: rate(leadsWithTrial, contacted),
    },
    aiSpendUsd: (await monthlySpendMicroUsd(now)) / 1_000_000,
  };
}

export type GrowthMetrics = Awaited<ReturnType<typeof growthMetrics>>;

export function formatRate(r: Rate): string {
  return r.value === null ? "-" : `${Math.round(r.value * 100)} % (${r.num}/${r.den})`;
}
