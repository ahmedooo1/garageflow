import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/lib/errors";
import { updateChecklistItem } from "@/server/services/checklist";
import { deleteCustomer, getCustomer, searchCustomers, updateCustomer } from "@/server/services/customers";
import { addDamage } from "@/server/services/damages";
import { addLine, regenerateLink, removeLine, reviseEstimate, sendEstimate } from "@/server/services/estimates";
import { addFinding, deleteFinding } from "@/server/services/findings";
import { addPhoto, deletePhoto } from "@/server/services/photos";
import { setUserActive, updateUserRole } from "@/server/services/users";
import { createVehicle, getVehicle, searchVehicles, updateVehicle } from "@/server/services/vehicles";
import { applyAction, assignTechnician, createWorkOrder, deliverVehicle, getWorkOrderDetail, listActiveWorkOrders, listWorkOrders, saveFinalCheck } from "@/server/services/workorders";
import { createCustomer } from "@/server/services/customers";
import { cleanupGarage, createTestGarage, jpegFixture, uniquePlate, type TestGarage } from "./helpers";

/**
 * Garage A ne doit jamais pouvoir lire ou modifier les données de Garage B,
 * même en connaissant les identifiants (IDOR).
 */
describe("isolation multi-tenant", () => {
  let A: TestGarage;
  let B: TestGarage;
  let bCustomerId: string;
  let bVehicleId: string;
  let bWorkOrderId: string;
  let bFindingId: string;
  let bPhotoId: string;
  let bLineId: string;
  let bEstimateId: string;

  beforeAll(async () => {
    A = await createTestGarage("A");
    B = await createTestGarage("B");
    const customer = await createCustomer(B.reception, { firstName: "Bob", lastName: "Garage-B", phone: "0600000000", email: "", address: "", notes: "secret B" });
    bCustomerId = customer.id;
    const vehicle = await createVehicle(B.reception, { customerId: customer.id, plate: uniquePlate(), make: "Peugeot", model: "208", fuel: "PETROL", mileage: 1000, vin: "", color: "", notes: "" });
    bVehicleId = vehicle.id;
    const wo = await createWorkOrder(B.reception, { customerId: customer.id, vehicleId: vehicle.id, mileageIn: 1200, reason: "Secret B", symptoms: "" });
    bWorkOrderId = wo.id;
    const finding = await addFinding(B.technician, wo.id, { title: "Constat B", category: "Freinage", description: "", urgency: "URGENT" });
    bFindingId = finding.id;
    const photo = await addPhoto(B.technician, wo.id, await jpegFixture("B"), { type: "FRONT", comment: "" });
    bPhotoId = photo.id;
    const line = await addLine(B.technician, wo.id, { title: "Ligne B", description: "", partsPrice: "10", laborPrice: "10", vatRate: "20", urgency: "URGENT" });
    bLineId = line.id;
    bEstimateId = line.estimateId;
  });

  afterAll(async () => {
    await cleanupGarage(A.garageId);
    await cleanupGarage(B.garageId);
  });

  it("A ne voit pas les clients / véhicules / dossiers de B dans les listes", async () => {
    expect((await searchCustomers(A.owner, "")).map((c) => c.id)).not.toContain(bCustomerId);
    expect((await searchCustomers(A.owner, "Garage-B")).length).toBe(0);
    expect((await searchVehicles(A.owner, "")).map((v) => v.id)).not.toContain(bVehicleId);
    expect((await listWorkOrders(A.owner, { status: "ALL" })).map((w) => w.id)).not.toContain(bWorkOrderId);
    expect((await listActiveWorkOrders(A.owner)).map((w) => w.id)).not.toContain(bWorkOrderId);
  });

  it("A ne peut pas lire les fiches de B par identifiant", async () => {
    await expect(getCustomer(A.owner, bCustomerId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getVehicle(A.owner, bVehicleId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getWorkOrderDetail(A.owner, bWorkOrderId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("A ne peut pas modifier ni supprimer les données de B", async () => {
    const customerInput = { firstName: "Hack", lastName: "Hack", phone: "", email: "", address: "", notes: "" };
    await expect(updateCustomer(A.owner, bCustomerId, customerInput)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteCustomer(A.owner, bCustomerId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateVehicle(A.owner, bVehicleId, { customerId: bCustomerId, plate: "HACK01", make: "X", model: "Y", fuel: "DIESEL", mileage: 0, vin: "", color: "", notes: "" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(assignTechnician(A.owner, bWorkOrderId, A.technician.userId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(applyAction(A.owner, bWorkOrderId, "START_DIAGNOSIS")).rejects.toBeInstanceOf(NotFoundError);
    await expect(applyAction(A.owner, bWorkOrderId, "CANCEL")).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveFinalCheck(A.owner, bWorkOrderId, {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(deliverVehicle(A.owner, bWorkOrderId, { mileageOut: 5000, comment: "" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("A ne peut pas toucher au diagnostic, aux photos ni à l'estimation de B", async () => {
    await expect(addFinding(A.technician, bWorkOrderId, { title: "x", category: "Moteur", description: "", urgency: "INFO" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteFinding(A.technician, bFindingId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addDamage(A.technician, bWorkOrderId, { type: "DENT", location: "x", description: "" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateChecklistItem(A.technician, bWorkOrderId, { key: "TIRE_FL", status: "OK", comment: "" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(addPhoto(A.technician, bWorkOrderId, await jpegFixture("A"), { type: "FRONT", comment: "" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deletePhoto(A.technician, bPhotoId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addLine(A.technician, bWorkOrderId, { title: "x", description: "", partsPrice: "1", laborPrice: "1", vatRate: "20", urgency: "INFO" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeLine(A.technician, bLineId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(sendEstimate(A.owner, bWorkOrderId, "http://localhost:3000")).rejects.toBeInstanceOf(NotFoundError);
    await expect(regenerateLink(A.owner, bEstimateId, "http://localhost:3000")).rejects.toBeInstanceOf(NotFoundError);
    await expect(reviseEstimate(A.owner, bEstimateId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("A ne peut pas créer un dossier ou un véhicule rattaché aux entités de B", async () => {
    await expect(createVehicle(A.reception, { customerId: bCustomerId, plate: uniquePlate(), make: "X", model: "Y", fuel: "DIESEL", mileage: 0, vin: "", color: "", notes: "" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createWorkOrder(A.reception, { customerId: bCustomerId, vehicleId: bVehicleId, mileageIn: 1, reason: "x", symptoms: "" })).rejects.toBeInstanceOf(NotFoundError);
    const aCustomer = await createCustomer(A.reception, { firstName: "Al", lastName: "A", phone: "", email: "", address: "", notes: "" });
    const aVehicle = await createVehicle(A.reception, { customerId: aCustomer.id, plate: uniquePlate(), make: "X", model: "Y", fuel: "DIESEL", mileage: 0, vin: "", color: "", notes: "" });
    // Technicien de B assigné à un dossier de A : refusé.
    await expect(createWorkOrder(A.reception, { customerId: aCustomer.id, vehicleId: aVehicle.id, mileageIn: 1, reason: "x", symptoms: "", technicianId: B.technician.userId })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("A ne peut pas administrer les utilisateurs de B", async () => {
    await expect(updateUserRole(A.owner, B.technician.userId, "OWNER")).rejects.toBeInstanceOf(NotFoundError);
    await expect(setUserActive(A.owner, B.technician.userId, false)).rejects.toBeInstanceOf(NotFoundError);
    const still = await prisma.user.findUnique({ where: { id: B.technician.userId }, select: { role: true, active: true } });
    expect(still).toEqual({ role: "TECHNICIAN", active: true });
  });

  it("les données de B sont intactes après toutes les tentatives", async () => {
    const wo = await getWorkOrderDetail(B.owner, bWorkOrderId);
    expect(wo.reason).toBe("Secret B");
    expect(wo.status).toBe("ARRIVED");
    expect(wo.findings).toHaveLength(1);
    expect(wo.photos).toHaveLength(1);
    expect(wo.estimates[0].lines).toHaveLength(1);
    const customer = await getCustomer(B.owner, bCustomerId);
    expect(customer.notes).toBe("secret B");
  });
});
