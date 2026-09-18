import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvalidTransitionError } from "@/lib/state-machine";
import { prisma } from "@/server/db";
import { AppError, ConflictError, ForbiddenError } from "@/server/lib/errors";
import { submitDecision } from "@/server/services/approvals";
import { createCustomer, deleteCustomer } from "@/server/services/customers";
import { addLine, sendEstimate, setLineWorkStatus } from "@/server/services/estimates";
import { addFinding } from "@/server/services/findings";
import { addPhoto } from "@/server/services/photos";
import { createUser, updateGarageSettings } from "@/server/services/users";
import { createVehicle } from "@/server/services/vehicles";
import { applyAction, createWorkOrder, deliverVehicle, getWorkOrderDetail, saveFinalCheck } from "@/server/services/workorders";
import { cleanupGarage, createTestGarage, jpegFixture, uniquePlate, type TestGarage } from "./helpers";

const APP_URL = "http://localhost:3000";

describe("permissions par rôle", () => {
  let g: TestGarage;
  beforeAll(async () => {
    g = await createTestGarage("Perm");
  });
  afterAll(async () => cleanupGarage(g.garageId));

  it("un technicien ne peut ni créer de client, ni de dossier, ni envoyer, ni restituer, ni gérer l'équipe", async () => {
    const input = { firstName: "X", lastName: "Y", phone: "", email: "", address: "", notes: "" };
    await expect(createCustomer(g.technician, input)).rejects.toBeInstanceOf(ForbiddenError);
    const customer = await createCustomer(g.reception, input);
    await expect(deleteCustomer(g.technician, customer.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createVehicle(g.technician, { customerId: customer.id, plate: uniquePlate(), make: "A", model: "B", fuel: "DIESEL", mileage: 0, vin: "", color: "", notes: "" })).rejects.toBeInstanceOf(ForbiddenError);
    const vehicle = await createVehicle(g.reception, { customerId: customer.id, plate: uniquePlate(), make: "A", model: "B", fuel: "DIESEL", mileage: 0, vin: "", color: "", notes: "" });
    await expect(createWorkOrder(g.technician, { customerId: customer.id, vehicleId: vehicle.id, mileageIn: 10, reason: "x", symptoms: "" })).rejects.toBeInstanceOf(ForbiddenError);
    const wo = await createWorkOrder(g.reception, { customerId: customer.id, vehicleId: vehicle.id, mileageIn: 10, reason: "x", symptoms: "" });
    await addLine(g.technician, wo.id, { title: "T", description: "", partsPrice: "10", laborPrice: "0", vatRate: "20", urgency: "INFO" });
    await expect(sendEstimate(g.technician, wo.id, APP_URL)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(applyAction(g.technician, wo.id, "CANCEL")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deliverVehicle(g.technician, wo.id, { mileageOut: 20, comment: "" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createUser(g.technician, { firstName: "A", lastName: "B", email: "z@test.local", password: "Password-12345", role: "OWNER" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createUser(g.reception, { firstName: "A", lastName: "B", email: "z@test.local", password: "Password-12345", role: "OWNER" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateGarageSettings(g.reception, { name: "Hack" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("workflow complet et transitions serveur", () => {
  let g: TestGarage;
  beforeAll(async () => {
    g = await createTestGarage("Flow");
  });
  afterAll(async () => cleanupGarage(g.garageId));

  it("déroule le parcours réception → diagnostic → validation → réparation → prêt → restitution → clôture", async () => {
    const customer = await createCustomer(g.reception, { firstName: "Jean", lastName: "Martin", phone: "0612345678", email: "", address: "", notes: "" });
    const vehicle = await createVehicle(g.reception, { customerId: customer.id, plate: "GH123KL", make: "Peugeot", model: "308", year: 2019, fuel: "DIESEL", mileage: 87400, vin: "", color: "", notes: "" });
    const wo = await createWorkOrder(g.reception, { customerId: customer.id, vehicleId: vehicle.id, mileageIn: 87650, reason: "Bruit au freinage", symptoms: "Grincement", technicianId: g.technician.userId });
    expect(wo.number).toMatch(/^D-\d{4}-0001$/);
    expect(wo.status).toBe("ARRIVED");
    expect((await prisma.vehicle.findUnique({ where: { id: vehicle.id } }))?.mileage).toBe(87650);
    expect(await prisma.checklistItem.count({ where: { workOrderId: wo.id } })).toBe(17);

    // Pas de second dossier ouvert pour le même véhicule.
    await expect(createWorkOrder(g.reception, { customerId: customer.id, vehicleId: vehicle.id, mileageIn: 87650, reason: "x", symptoms: "" })).rejects.toBeInstanceOf(ConflictError);

    // Transitions invalides refusées côté serveur.
    await expect(applyAction(g.technician, wo.id, "START_REPAIR")).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(applyAction(g.technician, wo.id, "MARK_READY")).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(applyAction(g.technician, wo.id, "ACTION_INCONNUE")).rejects.toBeInstanceOf(AppError);

    await addPhoto(g.technician, wo.id, await jpegFixture("AVANT"), { type: "FRONT", comment: "" });
    await applyAction(g.technician, wo.id, "START_DIAGNOSIS");
    const finding = await addFinding(g.technician, wo.id, { title: "Plaquettes usées", category: "Freinage", description: "2 mm", urgency: "URGENT" });
    const pads = await addLine(g.technician, wo.id, { title: "Plaquettes", description: "", partsPrice: "62,50", laborPrice: "83,33", vatRate: "20", urgency: "URGENT", findingId: finding.id });
    const oil = await addLine(g.technician, wo.id, { title: "Vidange", description: "", partsPrice: "48", laborPrice: "43,67", vatRate: "20", urgency: "RECOMMENDED" });
    const sent = await sendEstimate(g.reception, wo.id, APP_URL);
    await submitDecision(sent.token, { decisions: { [pads.id]: "ACCEPTED", [oil.id]: "REFUSED" } }, { ip: "1.1.1.1", userAgent: "t" });
    expect((await getWorkOrderDetail(g.owner, wo.id)).status).toBe("PARTIALLY_APPROVED");

    // Travaux cochables seulement pendant la réparation et seulement s'ils sont acceptés.
    await expect(setLineWorkStatus(g.technician, pads.id, true)).rejects.toBeInstanceOf(ConflictError);
    await applyAction(g.technician, wo.id, "START_REPAIR");
    await expect(setLineWorkStatus(g.technician, oil.id, true)).rejects.toBeInstanceOf(ConflictError);
    await setLineWorkStatus(g.technician, pads.id, true);
    await applyAction(g.technician, wo.id, "FINISH_REPAIR");
    expect((await getWorkOrderDetail(g.owner, wo.id)).status).toBe("QUALITY_CONTROL");

    // Véhicule prêt impossible sans contrôle final.
    await expect(applyAction(g.technician, wo.id, "MARK_READY")).rejects.toThrow(/contrôle final/);
    await saveFinalCheck(g.technician, wo.id, { roadTest: "on", fluids: "on", warningLights: "on", toolsRemoved: "on", cleaned: "on", comment: "" });
    await applyAction(g.technician, wo.id, "MARK_READY");
    expect((await getWorkOrderDetail(g.owner, wo.id)).status).toBe("READY_FOR_PICKUP");

    // Restitution : kilométrage cohérent, puis clôture.
    await expect(deliverVehicle(g.reception, wo.id, { mileageOut: 80000, comment: "" })).rejects.toBeInstanceOf(AppError);
    await deliverVehicle(g.reception, wo.id, { mileageOut: 87660, comment: "" });
    let detail = await getWorkOrderDetail(g.owner, wo.id);
    expect(detail.status).toBe("DELIVERED");
    expect(detail.deliveredAt).not.toBeNull();
    expect(detail.mileageOut).toBe(87660);
    expect((await prisma.vehicle.findUnique({ where: { id: vehicle.id } }))?.mileage).toBe(87660);
    await expect(applyAction(g.technician, wo.id, "CLOSE")).rejects.toBeInstanceOf(ForbiddenError);
    await applyAction(g.reception, wo.id, "CLOSE");
    detail = await getWorkOrderDetail(g.owner, wo.id);
    expect(detail.status).toBe("CLOSED");
    expect(detail.closedAt).not.toBeNull();

    // Dossier clôturé : plus aucune modification, aucune transition.
    await expect(addFinding(g.technician, wo.id, { title: "x", category: "Moteur", description: "", urgency: "INFO" })).rejects.toBeInstanceOf(ConflictError);
    await expect(applyAction(g.owner, wo.id, "CANCEL")).rejects.toBeInstanceOf(InvalidTransitionError);

    // Timeline complète.
    const types = detail.events.map((e) => e.type);
    for (const t of ["WORK_ORDER_CREATED", "PHOTO_ADDED", "FINDING_ADDED", "ESTIMATE_CREATED", "ESTIMATE_LINE_ADDED", "ESTIMATE_SENT", "CUSTOMER_DECISION", "LINE_COMPLETED", "FINAL_CHECK_SAVED", "VEHICLE_READY", "VEHICLE_DELIVERED", "WORK_ORDER_CLOSED"]) {
      expect(types, t).toContain(t);
    }
    expect(detail.events.filter((e) => e.type === "STATUS_CHANGED").map((e) => e.message)).toEqual(expect.arrayContaining(["Diagnostic commencé", "Réparation commencée", "Réparation terminée, passage au contrôle final"]));

    // Le véhicule peut être réceptionné à nouveau : nouveau numéro séquentiel.
    const wo2 = await createWorkOrder(g.reception, { customerId: customer.id, vehicleId: vehicle.id, mileageIn: 90000, reason: "Révision", symptoms: "" });
    expect(wo2.number).toMatch(/^D-\d{4}-0002$/);
  });
});
