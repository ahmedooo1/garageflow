import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/session";

/*
 * Contrôle d'accès des actions serveur et des routes, avec la vraie base :
 * seule la session est remplacée, pour jouer tour à tour un visiteur anonyme,
 * un gérant, un technicien, un administrateur plateforme, et un garage qui
 * vise les données d'un autre.
 */
const session = vi.hoisted(() => ({ current: null as null | { user: SessionUser } }));
vi.mock("@/server/auth/session", () => ({ getSession: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));

const { prisma } = await import("@/server/db");
const platform = await import("@/server/actions/platform");
const customers = await import("@/server/actions/customers");
const vehicles = await import("@/server/actions/vehicles");
const users = await import("@/server/actions/users");
const workorders = await import("@/server/actions/workorders");
const exportRoute = await import("@/app/api/export/route");
const { createCustomer } = await import("@/server/services/customers");
const { createVehicle } = await import("@/server/services/vehicles");
const { createWorkOrder } = await import("@/server/services/workorders");
const { cleanupGarage, createTestGarage, uniquePlate } = await import("./helpers");

type G = Awaited<ReturnType<typeof createTestGarage>>;
let A: G;
let B: G;
let ops: G;
let bCustomerId = "";
let bVehicleId = "";
let bWorkOrderId = "";
const MARKER = `Marqueur-B-${Date.now().toString(36)}`;

function as(g: G | null, who: "owner" | "technician" | "reception" = "owner", platformAdmin = false) {
  if (!g) {
    session.current = null;
    return;
  }
  const ctx = g[who];
  session.current = {
    user: { id: ctx.userId, garageId: g.garageId, email: "x@test.local", firstName: "X", lastName: "Y", role: ctx.role, platformAdmin, garageName: "G" } as SessionUser,
  };
}

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const empty = { ok: false } as const;

beforeAll(async () => {
  A = await createTestGarage("AccesA");
  B = await createTestGarage("AccesB");
  ops = await createTestGarage("AccesOps");
  await prisma.user.update({ where: { id: ops.owner.userId }, data: { platformAdmin: true } });
  const c = await createCustomer(B.reception, { firstName: "Client", lastName: MARKER, phone: "0600000000", email: "", address: "", notes: MARKER });
  bCustomerId = c.id;
  const v = await createVehicle(B.reception, { customerId: c.id, plate: uniquePlate(), make: "Peugeot", model: "308", fuel: "DIESEL", mileage: 1000, vin: "", color: "", notes: MARKER });
  bVehicleId = v.id;
  const wo = await createWorkOrder(B.reception, { customerId: c.id, vehicleId: v.id, mileageIn: 1000, reason: MARKER, symptoms: "" });
  bWorkOrderId = wo.id;
});

afterAll(async () => {
  for (const g of [A, B, ops]) if (g) await cleanupGarage(g.garageId);
});

describe("console plateforme : actions", () => {
  const calls = () => [
    platform.extendTrialAction(empty, form({ garageId: B.garageId, days: "30" })),
    platform.activatePlanAction(empty, form({ garageId: B.garageId, plan: "RESEAU", months: "12" })),
    platform.suspendGarageAction(empty, form({ garageId: B.garageId, reason: "test" })),
    platform.unsuspendGarageAction(empty, form({ garageId: B.garageId })),
  ];

  it("refusées à un visiteur anonyme, à un gérant et à un technicien, sans effet", async () => {
    const before = await prisma.garage.findUniqueOrThrow({ where: { id: B.garageId } });
    for (const [g, who] of [[null, "owner"], [A, "owner"], [A, "technician"], [B, "owner"]] as const) {
      as(g, who);
      for (const r of await Promise.all(calls())) {
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/Authentification|réservé à l'équipe GarageFlow/);
      }
    }
    const after = await prisma.garage.findUniqueOrThrow({ where: { id: B.garageId } });
    expect(after).toMatchObject({ plan: before.plan, subscriptionStatus: before.subscriptionStatus, trialEndsAt: before.trialEndsAt, suspendedAt: null });
  });

  it("un indicateur platformAdmin dans la session ne suffit pas : le rôle est relu en base", async () => {
    as(A, "owner", true); // session falsifiée : l'utilisateur n'est pas administrateur en base
    const r = await platform.extendTrialAction(empty, form({ garageId: B.garageId, days: "30" }));
    expect(r.ok).toBe(false);
  });

  it("autorisées à un administrateur plateforme", async () => {
    as(ops, "owner", true);
    const r = await platform.extendTrialAction(empty, form({ garageId: B.garageId, days: "7" }));
    expect(r.ok).toBe(true);
  });
});

describe("cloisonnement entre garages : actions", () => {
  it("un gérant ne peut ni modifier ni supprimer le client, le véhicule ou le dossier d'un autre garage", async () => {
    as(A, "owner");
    const results = [
      await customers.updateCustomerAction(empty, form({ id: bCustomerId, firstName: "Pirate", lastName: "A", phone: "0600000000", email: "", address: "", notes: "" })),
      await customers.deleteCustomerAction(empty, form({ id: bCustomerId })),
      await vehicles.updateVehicleAction(empty, form({ id: bVehicleId, customerId: bCustomerId, plate: uniquePlate(), make: "X", model: "Y", fuel: "DIESEL", mileage: "1" })),
      await workorders.assignTechnicianAction(empty, form({ workOrderId: bWorkOrderId, technicianId: A.technician.userId })),
      await workorders.workOrderActionAction(empty, form({ workOrderId: bWorkOrderId, action: "QUEUE_DIAGNOSIS" })),
      await workorders.addFindingAction(empty, form({ workOrderId: bWorkOrderId, title: "Pirate", category: "x", urgency: "INFO", description: "" })),
      await users.updateUserRoleAction(empty, form({ userId: B.technician.userId, role: "OWNER" })),
      await users.setUserActiveAction(empty, form({ userId: B.owner.userId, active: "0" })),
    ];
    for (const r of results) expect(r.error).toMatch(/introuvable|non autorisée|ne permet pas/i);
    for (const r of results) expect(r.ok).toBe(false);

    const c = await prisma.customer.findUniqueOrThrow({ where: { id: bCustomerId } });
    expect(c.firstName).toBe("Client");
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: bWorkOrderId } });
    expect(wo.status).toBe("ARRIVED");
    expect(wo.technicianId).toBeNull();
    expect(await prisma.finding.count({ where: { workOrderId: bWorkOrderId } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: B.technician.userId } })).role).toBe("TECHNICIAN");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: B.owner.userId } })).active).toBe(true);
  });

  it("l'administrateur plateforme n'a aucun passe-droit sur les données d'un garage", async () => {
    as(ops, "owner", true);
    const r = await customers.updateCustomerAction(empty, form({ id: bCustomerId, firstName: "Ops", lastName: "X", phone: "0600000000", email: "", address: "", notes: "" }));
    expect(r.ok).toBe(false);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: bCustomerId } })).firstName).toBe("Client");
  });

  it("un technicien ne gère ni l'équipe ni les paramètres de son propre garage", async () => {
    as(A, "technician");
    for (const r of [
      await users.updateUserRoleAction(empty, form({ userId: A.reception.userId, role: "OWNER" })),
      await users.updateGarageSettingsAction(empty, form({ name: "Pirate", address: "", phone: "", email: "", siret: "", vatRate: "20" })),
    ]) {
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/ne permet pas/);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: A.reception.userId } })).role).toBe("RECEPTION");
  });
});

describe("export des données (corps brut de la réponse)", () => {
  it("anonyme : 401 sans donnée", async () => {
    as(null);
    const res = await exportRoute.GET();
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(MARKER);
  });

  it("technicien : refusé", async () => {
    as(A, "technician");
    expect((await exportRoute.GET()).status).toBe(403);
  });

  it("le gérant d'un garage n'exporte que son garage", async () => {
    as(A, "owner");
    const res = await exportRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(MARKER);
    expect(body).not.toContain(B.garageId);
  });

  it("contrôle du test : le garage B peut agir sur ses propres données", async () => {
    as(B, "owner");
    expect((await workorders.workOrderActionAction(empty, form({ workOrderId: bWorkOrderId, action: "QUEUE_DIAGNOSIS" }))).ok).toBe(true);
    expect((await workorders.assignTechnicianAction(empty, form({ workOrderId: bWorkOrderId, technicianId: B.technician.userId }))).ok).toBe(true);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: bWorkOrderId } })).technicianId).toBe(B.technician.userId);
  });

  it("le gérant du garage B retrouve bien ses propres données (contrôle du test)", async () => {
    as(B, "owner");
    expect(await (await exportRoute.GET()).text()).toContain(MARKER);
  });
});
