import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PLANS, TRIAL_SEATS } from "@/lib/plans";
import { prisma } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { activateManually, assertSeatAvailable, getAccess, getSeatUsage, getSubscription, trialEndDate } from "@/server/services/billing";
import { extendTrial, listGarages, platformStats, setPlatformAdmin, suspendGarage, unsuspendGarage } from "@/server/services/platform";
import { createUser } from "@/server/services/users";
import { cleanupGarage, createTestGarage, PASSWORD, type TestGarage } from "./helpers";

const created: string[] = [];
afterAll(async () => {
  for (const id of created) await cleanupGarage(id);
});

async function garage(label: string): Promise<TestGarage> {
  const g = await createTestGarage(label);
  created.push(g.garageId);
  return g;
}

const DAY = 24 * 60 * 60 * 1000;

describe("abonnement du garage", () => {
  it("démarre un essai de 14 jours à l'inscription", async () => {
    const g = await garage("Sub1");
    const sub = await getSubscription(g.garageId);
    expect(sub.status).toBe("TRIALING");
    expect(sub.plan).toBe("ATELIER");
    const days = Math.round((sub.trialEndsAt.getTime() - Date.now()) / DAY);
    expect(days).toBe(14);
    const access = await getAccess(g.garageId);
    expect(access.canWrite).toBe(true);
    expect(access.trialing).toBe(true);
  });

  it("bloque l'écriture quand l'essai est dépassé, puis la rétablit après activation", async () => {
    const g = await garage("Sub2");
    await prisma.garage.update({ where: { id: g.garageId }, data: { trialEndsAt: new Date(Date.now() - DAY) } });
    let access = await getAccess(g.garageId);
    expect(access.canWrite).toBe(false);
    expect(access.reason).toMatch(/essai gratuit est terminé/i);

    await activateManually(g.garageId, { plan: "RESEAU", months: 3 }, g.owner.userId);
    access = await getAccess(g.garageId);
    expect(access.canWrite).toBe(true);
    expect(access.plan).toBe("RESEAU");
    expect(access.seats).toBe(PLANS.RESEAU.seats);
    const sub = await getSubscription(g.garageId);
    expect(sub.status).toBe("ACTIVE");
    expect(sub.currentPeriodEnd).not.toBeNull();
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
  });

  it("une suspension bloque même un abonnement payé, la levée le rétablit", async () => {
    const g = await garage("Sub3");
    await activateManually(g.garageId, { plan: "ATELIER", months: 12 }, g.owner.userId);
    await suspendGarage(g.garageId, "Impayé récurrent", g.owner.userId);
    let access = await getAccess(g.garageId);
    expect(access.canWrite).toBe(false);
    expect(access.reason).toBe("Impayé récurrent");

    await unsuspendGarage(g.garageId, g.owner.userId);
    access = await getAccess(g.garageId);
    expect(access.canWrite).toBe(true);
    expect(access.status).toBe("ACTIVE");
  });

  it("prolonge l'essai depuis la console et refuse les durées aberrantes", async () => {
    const g = await garage("Sub4");
    await prisma.garage.update({ where: { id: g.garageId }, data: { trialEndsAt: new Date(Date.now() - 5 * DAY) } });
    await extendTrial(g.garageId, 7, g.owner.userId);
    const access = await getAccess(g.garageId);
    expect(access.canWrite).toBe(true);
    expect(access.trialDaysLeft).toBe(7);
    await expect(extendTrial(g.garageId, 0, g.owner.userId)).rejects.toBeInstanceOf(AppError);
    await expect(extendTrial(g.garageId, 500, g.owner.userId)).rejects.toBeInstanceOf(AppError);
    await expect(extendTrial("garage-inexistant", 7, g.owner.userId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuse de dépasser le nombre de comptes du plan", async () => {
    const g = await garage("Seats");
    // 3 comptes créés par le helper (gérant, réception, technicien).
    const usage = await getSeatUsage(g.garageId);
    expect(usage.used).toBe(3);
    expect(usage.limit).toBe(TRIAL_SEATS);

    for (let i = usage.used; i < usage.limit; i++) {
      await createUser(g.owner, { firstName: "Tech", lastName: `N${i}`, email: `seat-${i}-${g.garageId}@test.local`, password: PASSWORD, role: "TECHNICIAN" });
    }
    await expect(assertSeatAvailable(g.garageId)).rejects.toBeInstanceOf(AppError);
    await expect(
      createUser(g.owner, { firstName: "Trop", lastName: "Plein", email: `seat-over-${g.garageId}@test.local`, password: PASSWORD, role: "TECHNICIAN" }),
    ).rejects.toThrow(/plan autorise/i);

    // Libérer une place permet d'en ajouter un.
    const last = await prisma.user.findFirst({ where: { garageId: g.garageId, role: "TECHNICIAN" }, orderBy: { createdAt: "desc" } });
    await prisma.user.update({ where: { id: last!.id }, data: { active: false } });
    await expect(assertSeatAvailable(g.garageId)).resolves.toBeUndefined();
  });

  it("un plan supérieur ouvre davantage de comptes", async () => {
    const g = await garage("SeatsPro");
    await activateManually(g.garageId, { plan: "RESEAU", months: 1 }, g.owner.userId);
    const usage = await getSeatUsage(g.garageId);
    expect(usage.limit).toBe(PLANS.RESEAU.seats);
    await expect(assertSeatAvailable(g.garageId)).resolves.toBeUndefined();
  });
});

describe("console plateforme", () => {
  let a: TestGarage;
  let b: TestGarage;

  beforeEach(async () => {
    a ??= await garage("PlatA");
    b ??= await garage("PlatB");
  });

  it("aucun utilisateur n'est administrateur plateforme par défaut", async () => {
    const users = await prisma.user.findMany({ where: { garageId: a.garageId }, select: { platformAdmin: true } });
    expect(users.every((u) => u.platformAdmin === false)).toBe(true);
  });

  it("l'octroi et le retrait du rôle plateforme sont tracés, sans auto-retrait", async () => {
    await setPlatformAdmin(a.owner.userId, true, a.owner.userId);
    expect((await prisma.user.findUnique({ where: { id: a.owner.userId } }))?.platformAdmin).toBe(true);
    await expect(setPlatformAdmin(a.owner.userId, false, a.owner.userId)).rejects.toBeInstanceOf(AppError);
    await setPlatformAdmin(a.owner.userId, false, b.owner.userId);
    expect((await prisma.user.findUnique({ where: { id: a.owner.userId } }))?.platformAdmin).toBe(false);
    const log = await prisma.auditLog.findFirst({ where: { action: "platform.admin_revoked", entityId: a.owner.userId } });
    expect(log).not.toBeNull();
  });

  it("la liste plateforme n'expose que des agrégats, jamais les données métier", async () => {
    const rows = await listGarages();
    const row = rows.find((r) => r.id === a.garageId);
    expect(row).toBeDefined();
    expect(row!.counts).toEqual({ users: expect.any(Number), customers: expect.any(Number), vehicles: expect.any(Number), workOrders: expect.any(Number) });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toMatch(/passwordHash/);
    expect(Object.keys(row!)).not.toContain("customers");
    expect(Object.keys(row!)).not.toContain("workOrders");
  });

  it("la recherche plateforme filtre par nom de garage", async () => {
    const rows = await listGarages("PlatA");
    expect(rows.map((r) => r.id)).toContain(a.garageId);
    expect(rows.map((r) => r.id)).not.toContain(b.garageId);
  });

  it("les statistiques comptent les garages et le revenu des abonnés actifs", async () => {
    await activateManually(b.garageId, { plan: "ATELIER", months: 1 }, b.owner.userId);
    const stats = await platformStats();
    expect(stats.garages).toBeGreaterThanOrEqual(2);
    expect(stats.active).toBeGreaterThanOrEqual(1);
    expect(stats.mrrHt).toBeGreaterThanOrEqual(PLANS.ATELIER.priceHt);
  });
});

describe("dates d'essai", () => {
  it("trialEndDate place la fin d'essai 14 jours plus tard", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(trialEndDate(from).toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("le rôle technicien ne permet pas d'administrer les comptes", async () => {
    const g = await garage("SeatRole");
    await expect(
      createUser(g.technician, { firstName: "X", lastName: "Y", email: `nope-${g.garageId}@test.local`, password: PASSWORD, role: "TECHNICIAN" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
