import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { sha256 } from "@/server/lib/crypto";
import { AppError, ConflictError, NotFoundError } from "@/server/lib/errors";
import { getPortalData, submitDecision } from "@/server/services/approvals";
import { createCustomer } from "@/server/services/customers";
import { addLine, regenerateLink, removeLine, reviseEstimate, sendEstimate } from "@/server/services/estimates";
import { addFinding } from "@/server/services/findings";
import { createVehicle } from "@/server/services/vehicles";
import { applyAction, createWorkOrder, getWorkOrderDetail } from "@/server/services/workorders";
import { cleanupGarage, createTestGarage, uniquePlate, type TestGarage } from "./helpers";

const META = { ip: "10.0.0.1", userAgent: "vitest" };
const APP_URL = "http://localhost:3000";

async function newWorkOrder(g: TestGarage) {
  const customer = await createCustomer(g.reception, { firstName: "Jean", lastName: "Martin", phone: "", email: "", address: "", notes: "" });
  const vehicle = await createVehicle(g.reception, { customerId: customer.id, plate: uniquePlate(), make: "Peugeot", model: "308", fuel: "DIESEL", mileage: 87000, vin: "", color: "", notes: "" });
  return createWorkOrder(g.reception, { customerId: customer.id, vehicleId: vehicle.id, mileageIn: 87650, reason: "Freins", symptoms: "" });
}

describe("validation client", () => {
  let g: TestGarage;
  beforeAll(async () => {
    g = await createTestGarage("Approval");
  });
  afterAll(async () => cleanupGarage(g.garageId));

  it("accepte certaines lignes et en refuse d'autres, verrouille l'estimation et met à jour le statut", async () => {
    const wo = await newWorkOrder(g);
    await applyAction(g.technician, wo.id, "START_DIAGNOSIS");
    const finding = await addFinding(g.technician, wo.id, { title: "Plaquettes usées", category: "Freinage", description: "", urgency: "URGENT" });
    const pads = await addLine(g.technician, wo.id, { title: "Plaquettes", description: "", partsPrice: "62,50", laborPrice: "83,33", vatRate: "20", urgency: "URGENT", findingId: finding.id });
    const oil = await addLine(g.technician, wo.id, { title: "Vidange", description: "", partsPrice: "48", laborPrice: "43,67", vatRate: "20", urgency: "RECOMMENDED" });
    expect(pads.totalTtc.toString()).toBe("175");
    expect(oil.totalTtc.toString()).toBe("110");

    const sent = await sendEstimate(g.reception, wo.id, APP_URL);
    expect(sent.url).toBe(`${APP_URL}/validation/${sent.token}`);
    expect(sent.token.length).toBeGreaterThanOrEqual(40);
    // Le jeton brut n'est jamais stocké : seul son hash l'est.
    const stored = await prisma.approvalToken.findFirst({ where: { estimateId: sent.estimateId } });
    expect(stored?.tokenHash).toBe(sha256(sent.token));
    expect(stored?.tokenHash).not.toBe(sent.token);
    expect((await getWorkOrderDetail(g.owner, wo.id)).status).toBe("WAITING_CUSTOMER_APPROVAL");

    // Une estimation envoyée est verrouillée côté garage.
    await expect(removeLine(g.technician, pads.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(addLine(g.technician, wo.id, { title: "x", description: "", partsPrice: "1", laborPrice: "1", vatRate: "20", urgency: "INFO" })).rejects.toBeInstanceOf(ConflictError);

    const portal = await getPortalData(sent.token, META.ip);
    expect(portal.estimate.lines).toHaveLength(2);
    expect(portal.estimate.totals.totalTtc).toBe("285");
    expect(portal.findings[0].title).toBe("Plaquettes usées");

    // Décision incomplète refusée.
    await expect(submitDecision(sent.token, { decisions: { [pads.id]: "ACCEPTED" } }, META)).rejects.toBeInstanceOf(AppError);

    const res = await submitDecision(sent.token, { decisions: { [pads.id]: "ACCEPTED", [oil.id]: "REFUSED" }, customerName: "Jean Martin", comment: "" }, META);
    expect(res.nextStatus).toBe("PARTIALLY_APPROVED");
    expect(res.acceptedTotal.toString()).toBe("175");

    const detail = await getWorkOrderDetail(g.owner, wo.id);
    expect(detail.status).toBe("PARTIALLY_APPROVED");
    const estimate = detail.estimates[0];
    expect(estimate.status).toBe("DECIDED");
    expect(estimate.lines.find((l) => l.id === pads.id)?.decision).toBe("ACCEPTED");
    expect(estimate.lines.find((l) => l.id === oil.id)?.decision).toBe("REFUSED");
    expect(estimate.approval?.acceptedTotal.toString()).toBe("175");
    expect(estimate.approval?.refusedTotal.toString()).toBe("110");
    expect(estimate.approval?.acceptedCount).toBe(1);
    expect(estimate.approval?.refusedCount).toBe(1);
    expect(estimate.approval?.ip).toBe(META.ip);
    expect(estimate.approval?.customerName).toBe("Jean Martin");
    expect((estimate.approval?.snapshot as { version: number }).version).toBe(1);
    expect(detail.events.some((e) => e.type === "CUSTOMER_DECISION" && e.actorLabel === "Jean Martin")).toBe(true);

    // Une proposition validée ne peut plus être modifiée, ni resoumise, ni révisée.
    await expect(submitDecision(sent.token, { decisions: { [pads.id]: "REFUSED", [oil.id]: "REFUSED" } }, META)).rejects.toBeInstanceOf(ConflictError);
    await expect(reviseEstimate(g.owner, sent.estimateId)).rejects.toBeInstanceOf(ConflictError);
    await expect(regenerateLink(g.owner, sent.estimateId, APP_URL)).rejects.toBeInstanceOf(ConflictError);
    const after = await prisma.estimateLine.findUnique({ where: { id: pads.id } });
    expect(after?.decision).toBe("ACCEPTED");
    // Le portail reste consultable en lecture (récapitulatif).
    const decided = await getPortalData(sent.token, META.ip);
    expect(decided.estimate.status).toBe("DECIDED");
  });

  it("tout accepté → APPROVED, tout refusé → READY_FOR_PICKUP", async () => {
    const wo1 = await newWorkOrder(g);
    const l1 = await addLine(g.technician, wo1.id, { title: "A", description: "", partsPrice: "100", laborPrice: "0", vatRate: "20", urgency: "URGENT" });
    const s1 = await sendEstimate(g.owner, wo1.id, APP_URL);
    expect((await submitDecision(s1.token, { decisions: { [l1.id]: "ACCEPTED" } }, META)).nextStatus).toBe("APPROVED");

    const wo2 = await newWorkOrder(g);
    const l2 = await addLine(g.technician, wo2.id, { title: "B", description: "", partsPrice: "100", laborPrice: "0", vatRate: "20", urgency: "URGENT" });
    const s2 = await sendEstimate(g.owner, wo2.id, APP_URL);
    expect((await submitDecision(s2.token, { decisions: { [l2.id]: "REFUSED" } }, META)).nextStatus).toBe("READY_FOR_PICKUP");
  });

  it("rejette les jetons inconnus, révoqués ou expirés", async () => {
    await expect(getPortalData("jeton-inexistant-mais-assez-long-0123456789", META.ip)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPortalData("court", META.ip)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPortalData("../../etc/passwd-0123456789012345678901234567890", META.ip)).rejects.toBeInstanceOf(NotFoundError);

    const wo = await newWorkOrder(g);
    const line = await addLine(g.technician, wo.id, { title: "A", description: "", partsPrice: "10", laborPrice: "0", vatRate: "20", urgency: "INFO" });
    const first = await sendEstimate(g.owner, wo.id, APP_URL);
    // Régénération : l'ancien lien est révoqué.
    const second = await regenerateLink(g.owner, first.estimateId, APP_URL);
    await expect(getPortalData(first.token, META.ip)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPortalData(second.token, META.ip)).resolves.toBeTruthy();
    // Expiration.
    await prisma.approvalToken.updateMany({ where: { estimateId: first.estimateId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(getPortalData(second.token, META.ip)).rejects.toBeInstanceOf(NotFoundError);
    await expect(submitDecision(second.token, { decisions: { [line.id]: "ACCEPTED" } }, META)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("réviser crée une nouvelle version et conserve l'ancienne intacte", async () => {
    const wo = await newWorkOrder(g);
    await addLine(g.technician, wo.id, { title: "A", description: "", partsPrice: "10", laborPrice: "0", vatRate: "20", urgency: "INFO" });
    const sent = await sendEstimate(g.owner, wo.id, APP_URL);
    const draft = await reviseEstimate(g.owner, sent.estimateId);
    expect(draft.version).toBe(2);
    await expect(getPortalData(sent.token, META.ip)).rejects.toBeInstanceOf(NotFoundError);
    const detail = await getWorkOrderDetail(g.owner, wo.id);
    expect(detail.status).toBe("DIAGNOSIS_IN_PROGRESS");
    expect(detail.estimates.map((e) => [e.version, e.status])).toEqual([
      [2, "DRAFT"],
      [1, "SUPERSEDED"],
    ]);
    expect(detail.estimates[0].lines).toHaveLength(1);
    expect(detail.estimates[1].lines).toHaveLength(1);
  });

  it("ne renvoie au portail aucune donnée d'un autre dossier ni identifiant interne", async () => {
    const wo = await newWorkOrder(g);
    await addLine(g.technician, wo.id, { title: "A", description: "", partsPrice: "10", laborPrice: "0", vatRate: "20", urgency: "INFO" });
    const sent = await sendEstimate(g.owner, wo.id, APP_URL);
    const portal = await getPortalData(sent.token, META.ip);
    expect(JSON.stringify(portal)).not.toContain(g.garageId);
    expect(JSON.stringify(portal)).not.toContain(wo.customerId);
    expect(portal.customer).toEqual({ firstName: "Jean", lastName: "Martin" });
  });
});
