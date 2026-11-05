import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createCustomer } from "@/server/services/customers";
import { createVehicle, getVehicle, updateVehicle } from "@/server/services/vehicles";
import { cleanupGarage, createTestGarage } from "./helpers";

/* Enregistrement des rubriques lues sur la carte grise (D.2, D.2.1, P.1) et de leur origine. */
type G = Awaited<ReturnType<typeof createTestGarage>>;
let A: G;
let B: G;

beforeAll(async () => {
  A = await createTestGarage("CarteGriseA");
  B = await createTestGarage("CarteGriseB");
});
afterAll(async () => {
  for (const g of [A, B]) if (g) await cleanupGarage(g.garageId);
});

const customer = (g: G) => createCustomer(g.reception, { firstName: "Client", lastName: "CarteGrise", phone: "0600000000", email: "", address: "", notes: "" });

describe("véhicule issu d'une carte grise", () => {
  it("enregistre les rubriques techniques et l'origine déclarée", async () => {
    const c = await customer(A);
    const v = await createVehicle(A.reception, {
      customerId: c.id, plate: "AB-123-CD", make: "Peugeot", model: "308", fuel: "DIESEL", mileage: 1, vin: "VF3LBYHZPMS000001",
      tvv: "mlbyhzr", cnit: "M10PGTVP0025671", displacementCc: "1499", powerKw: "96", fiscalPower: "7", firstRegistrationDate: "2021-03-12", technicalOrigin: "carte_grise",
    });
    expect(v).toMatchObject({ tvv: "MLBYHZR", cnit: "M10PGTVP0025671", displacementCc: 1499, technicalSource: "Carte grise (lecture locale, vérifiée par l'utilisateur)" });
  });

  it("une origine inconnue devient une saisie manuelle ; les formats invalides sont refusés", async () => {
    const c = await customer(A);
    const v = await createVehicle(A.reception, { customerId: c.id, plate: "CD-234-EF", make: "Renault", model: "Clio", technicalOrigin: "api-payante" as never });
    expect(v.technicalSource).toBe("Saisie manuelle");
    await expect(createVehicle(A.reception, { customerId: c.id, plate: "EF-345-GH", make: "Renault", model: "Clio", cnit: "M10 <script>" })).rejects.toThrow();
    await expect(createVehicle(A.reception, { customerId: c.id, plate: "EF-345-GH", make: "Renault", model: "Clio", displacementCc: "12" })).rejects.toThrow();
  });

  it("relire la carte grise sur une fiche existante en change l'origine ; une correction manuelle aussi", async () => {
    const c = await customer(A);
    const v = await createVehicle(A.reception, { customerId: c.id, plate: "GH-456-JK", make: "Dacia", model: "Sandero" });
    const fromCard = await updateVehicle(A.reception, v.id, { customerId: c.id, plate: "GH-456-JK", make: "Dacia", model: "Sandero", cnit: "M10DACVP0001A01", technicalOrigin: "carte_grise" });
    expect(fromCard.technicalSource).toMatch(/^Carte grise/);
    const manual = await updateVehicle(A.reception, v.id, { customerId: c.id, plate: "GH-456-JK", make: "Dacia", model: "Sandero", cnit: "M10DACVP0001A02" });
    expect(manual.technicalSource).toBe("Saisie manuelle");
  });

  it("cloisonnement : un autre garage ne lit ni ne modifie ces rubriques", async () => {
    const v = await prisma.vehicle.findFirstOrThrow({ where: { garageId: A.garageId, plate: "AB123CD" } });
    await expect(getVehicle(B.reception, v.id)).rejects.toThrow(/introuvable/);
    const cb = await customer(B);
    await expect(updateVehicle(B.reception, v.id, { customerId: cb.id, plate: "AB-123-CD", make: "X", model: "Y", cnit: "PIRATE", technicalOrigin: "carte_grise" })).rejects.toThrow(/introuvable/);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).cnit).toBe("M10PGTVP0025671");
  });
});
