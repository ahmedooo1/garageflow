import type { Plan } from "@prisma/client";
import { evaluateAccess, PLANS, type AccessState } from "@/lib/plans";
import { prisma } from "@/server/db";
import { AppError, NotFoundError } from "@/server/lib/errors";
import { audit } from "./audit";

/**
 * Console plateforme : vue d'exploitation pour l'équipe GarageFlow.
 * Volontairement limitée à des agrégats et à l'abonnement — aucun accès aux
 * données métier des garages (clients, véhicules, dossiers).
 */

export type GarageRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: Date;
  owner: { firstName: string; lastName: string; email: string } | null;
  counts: { users: number; customers: number; vehicles: number; workOrders: number };
  access: AccessState;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  suspendedReason: string;
  lastActivityAt: Date | null;
};

export async function listGarages(query = ""): Promise<GarageRow[]> {
  const q = query.trim();
  const garages = await prisma.garage.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { users: { some: { email: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      suspendedAt: true,
      suspendedReason: true,
      stripeCustomerId: true,
      users: { where: { role: "OWNER" }, select: { firstName: true, lastName: true, email: true }, orderBy: { createdAt: "asc" }, take: 1 },
      workOrders: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      _count: { select: { users: true, customers: true, vehicles: true, workOrders: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return garages.map((g) => ({
    id: g.id,
    name: g.name,
    email: g.email,
    phone: g.phone,
    createdAt: g.createdAt,
    owner: g.users[0] ?? null,
    counts: { users: g._count.users, customers: g._count.customers, vehicles: g._count.vehicles, workOrders: g._count.workOrders },
    access: evaluateAccess({
      plan: g.plan,
      status: g.subscriptionStatus,
      trialEndsAt: g.trialEndsAt,
      currentPeriodEnd: g.currentPeriodEnd,
      cancelAtPeriodEnd: g.cancelAtPeriodEnd,
      suspendedAt: g.suspendedAt,
      suspendedReason: g.suspendedReason,
    }),
    trialEndsAt: g.trialEndsAt,
    currentPeriodEnd: g.currentPeriodEnd,
    stripeCustomerId: g.stripeCustomerId,
    suspendedReason: g.suspendedReason,
    lastActivityAt: g.workOrders[0]?.updatedAt ?? null,
  }));
}

export type PlatformStats = {
  garages: number;
  trialing: number;
  active: number;
  suspended: number;
  workOrders: number;
  mrrHt: number;
};

export async function platformStats(): Promise<PlatformStats> {
  const [garages, byStatus, workOrders, activePlans] = await Promise.all([
    prisma.garage.count(),
    prisma.garage.groupBy({ by: ["subscriptionStatus"], _count: true }),
    prisma.workOrder.count(),
    prisma.garage.groupBy({ by: ["plan"], where: { subscriptionStatus: "ACTIVE" }, _count: true }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.subscriptionStatus === s)?._count ?? 0;
  const mrrHt = activePlans.reduce((sum, p) => sum + PLANS[p.plan].priceHt * p._count, 0);
  return {
    garages,
    trialing: count("TRIALING"),
    active: count("ACTIVE"),
    suspended: count("SUSPENDED"),
    workOrders,
    mrrHt,
  };
}

async function requireGarage(garageId: string) {
  const garage = await prisma.garage.findUnique({ where: { id: garageId }, select: { id: true, trialEndsAt: true } });
  if (!garage) throw new NotFoundError("Garage introuvable");
  return garage;
}

export async function extendTrial(garageId: string, days: number, actorId: string): Promise<void> {
  const value = Math.round(days);
  if (!Number.isFinite(value) || value < 1 || value > 90) throw new AppError("Durée invalide (1 à 90 jours)");
  const garage = await requireGarage(garageId);
  const base = garage.trialEndsAt.getTime() > Date.now() ? garage.trialEndsAt : new Date();
  const trialEndsAt = new Date(base.getTime() + value * 24 * 60 * 60 * 1000);
  await prisma.garage.update({ where: { id: garageId }, data: { trialEndsAt, subscriptionStatus: "TRIALING", suspendedAt: null, suspendedReason: "" } });
  await audit({ garageId, userId: actorId, action: "platform.trial_extended", entityType: "Garage", entityId: garageId, metadata: { days: value } });
}

export async function suspendGarage(garageId: string, reason: string, actorId: string): Promise<void> {
  await requireGarage(garageId);
  const message = reason.trim().slice(0, 300);
  await prisma.garage.update({
    where: { id: garageId },
    data: { subscriptionStatus: "SUSPENDED", suspendedAt: new Date(), suspendedReason: message || "Compte suspendu. Contactez le support GarageFlow." },
  });
  await audit({ garageId, userId: actorId, action: "platform.suspended", entityType: "Garage", entityId: garageId, metadata: { reason: message } });
}

export async function unsuspendGarage(garageId: string, actorId: string): Promise<void> {
  const garage = await prisma.garage.findUnique({ where: { id: garageId }, select: { currentPeriodEnd: true, trialEndsAt: true } });
  if (!garage) throw new NotFoundError("Garage introuvable");
  const stillPaid = garage.currentPeriodEnd !== null && garage.currentPeriodEnd.getTime() > Date.now();
  const stillTrialing = garage.trialEndsAt.getTime() > Date.now();
  await prisma.garage.update({
    where: { id: garageId },
    data: { suspendedAt: null, suspendedReason: "", subscriptionStatus: stillPaid ? "ACTIVE" : stillTrialing ? "TRIALING" : "CANCELED" },
  });
  await audit({ garageId, userId: actorId, action: "platform.unsuspended", entityType: "Garage", entityId: garageId });
}

export async function setPlatformAdmin(userId: string, value: boolean, actorId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, garageId: true } });
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (userId === actorId && !value) throw new AppError("Vous ne pouvez pas retirer votre propre accès plateforme");
  await prisma.user.update({ where: { id: userId }, data: { platformAdmin: value } });
  await audit({ garageId: user.garageId, userId: actorId, action: value ? "platform.admin_granted" : "platform.admin_revoked", entityType: "User", entityId: userId });
}

export type ActivationInput = { plan: Plan; months: number };
