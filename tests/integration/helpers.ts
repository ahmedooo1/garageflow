import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Ctx } from "@/server/context";
import { registerGarage } from "@/server/services/auth";
import { purgeGarage } from "@/server/services/garage-lifecycle";
import { createUser } from "@/server/services/users";

export const PASSWORD = "Test-Password-123!";

export type TestGarage = {
  garageId: string;
  owner: Ctx;
  reception: Ctx;
  technician: Ctx;
  ownerEmail: string;
  technicianEmail: string;
};

/** Crée un garage complet (gérant, réception, technicien) avec des contextes prêts à l'emploi. */
export async function createTestGarage(label = "Garage"): Promise<TestGarage> {
  const suffix = randomUUID().slice(0, 8);
  const ownerEmail = `owner-${suffix}@test.local`;
  const { garage, user: owner } = await registerGarage({
    garageName: `${label} ${suffix}`,
    firstName: "Gérant",
    lastName: label,
    email: ownerEmail,
    password: PASSWORD,
  });
  const ownerCtx: Ctx = { garageId: garage.id, userId: owner.id, role: "OWNER" };
  const reception = await createUser(ownerCtx, { firstName: "Réception", lastName: label, email: `reception-${suffix}@test.local`, password: PASSWORD, role: "RECEPTION" });
  const technicianEmail = `tech-${suffix}@test.local`;
  const technician = await createUser(ownerCtx, { firstName: "Tech", lastName: label, email: technicianEmail, password: PASSWORD, role: "TECHNICIAN" });
  return {
    garageId: garage.id,
    owner: ownerCtx,
    reception: { garageId: garage.id, userId: reception.id, role: "RECEPTION" },
    technician: { garageId: garage.id, userId: technician.id, role: "TECHNICIAN" },
    ownerEmail,
    technicianEmail,
  };
}

export async function cleanupGarage(garageId: string): Promise<void> {
  await purgeGarage(garageId);
}

export async function jpegFixture(label = "TEST"): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#3a4655"/><text x="320" y="250" font-size="48" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

export const uniquePlate = () => `T${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
