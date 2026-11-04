import { FuelType } from "@prisma/client";
import { z } from "zod";
import { normalizePlate } from "@/lib/format";
import { prisma } from "@/server/db";
import { assertPermission, type Ctx } from "@/server/context";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { idField, intField, optionalInt, optionalText, parseOrThrow, requiredText } from "@/server/lib/validation";
import { confirmedLookupSource } from "@/server/plate-lookup/service";
import { audit } from "./audit";

export const vehicleSchema = z.object({
  customerId: idField,
  plate: z
    .string()
    .trim()
    .min(2, "Immatriculation obligatoire")
    .max(20)
    .transform(normalizePlate)
    .refine((v) => v.length >= 2 && v.length <= 12, "Immatriculation invalide"),
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .max(17, "VIN : 17 caractères maximum")
    .refine((v) => v === "" || /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v), "VIN invalide")
    .default(""),
  make: requiredText("Marque", 60),
  model: requiredText("Modèle", 60),
  year: optionalInt(1950, 2100),
  fuel: z.nativeEnum(FuelType).default("DIESEL"),
  mileage: intField("Kilométrage", 0, 5_000_000).default(0),
  color: z.string().trim().max(40).default(""),
  notes: optionalText(2000),
  version: z.string().trim().max(80).default(""),
  engine: z.string().trim().max(80).default(""),
  firstRegistrationDate: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")])
    .optional()
    .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null))
    .refine((d) => d === null || (!Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1900 && d.getTime() <= Date.now() + 24 * 3600 * 1000), "Date invalide"),
  powerKw: optionalInt(1, 2000),
  fiscalPower: optionalInt(1, 200),
  gearbox: z.string().trim().max(40).default(""),
  /** Recherche par immatriculation confirmée dans le formulaire (vérifiée côté serveur). */
  plateLookupId: z.string().trim().max(64).default(""),
});

const TECHNICAL_KEYS = ["make", "model", "year", "fuel", "vin", "version", "engine", "firstRegistrationDate", "powerKw", "fiscalPower", "gearbox"] as const;
type VehicleData = z.output<typeof vehicleSchema>;

function technicalChanged(before: Record<string, unknown>, after: VehicleData): boolean {
  return TECHNICAL_KEYS.some((k) => {
    const a = before[k] instanceof Date ? (before[k] as Date).toISOString() : (before[k] ?? null);
    const b = after[k] instanceof Date ? (after[k] as Date).toISOString() : (after[k] ?? null);
    return a !== b;
  });
}

export type VehicleInput = z.input<typeof vehicleSchema>;

export async function createVehicle(ctx: Ctx, input: VehicleInput) {
  assertPermission(ctx, "vehicles:write");
  const data = parseOrThrow(vehicleSchema, input);
  const customer = await prisma.customer.findFirst({ where: { id: data.customerId, garageId: ctx.garageId }, select: { id: true } });
  if (!customer) throw new NotFoundError("Client introuvable");
  const dup = await prisma.vehicle.findUnique({ where: { garageId_plate: { garageId: ctx.garageId, plate: data.plate } }, select: { id: true } });
  if (dup) throw new ConflictError("Un véhicule avec cette immatriculation existe déjà");
  const { plateLookupId, ...fields } = data;
  // La source n'est jamais celle déclarée par le navigateur : elle est vérifiée en base.
  const lookupSource = await confirmedLookupSource(ctx, plateLookupId, data.plate);
  const vehicle = await prisma.vehicle.create({
    data: { ...fields, garageId: ctx.garageId, technicalSource: lookupSource ?? "Saisie manuelle", technicalConfirmedAt: new Date() },
  });
  await audit({
    garageId: ctx.garageId,
    userId: ctx.userId,
    action: "vehicle.create",
    entityType: "Vehicle",
    entityId: vehicle.id,
    ip: ctx.ip,
    ...(lookupSource ? { metadata: { plateLookupId } } : {}),
  });
  return vehicle;
}

export async function updateVehicle(ctx: Ctx, id: string, input: VehicleInput) {
  assertPermission(ctx, "vehicles:write");
  const data = parseOrThrow(vehicleSchema, input);
  const existing = await prisma.vehicle.findFirst({ where: { id, garageId: ctx.garageId } });
  if (!existing) throw new NotFoundError("Véhicule introuvable");
  const customer = await prisma.customer.findFirst({ where: { id: data.customerId, garageId: ctx.garageId }, select: { id: true } });
  if (!customer) throw new NotFoundError("Client introuvable");
  const dup = await prisma.vehicle.findFirst({ where: { garageId: ctx.garageId, plate: data.plate, NOT: { id } }, select: { id: true } });
  if (dup) throw new ConflictError("Un autre véhicule porte déjà cette immatriculation");
  const { plateLookupId: _ignored, ...fields } = data;
  void _ignored;
  // Une modification des caractéristiques en change l'origine : elles deviennent une saisie manuelle.
  const technical = technicalChanged(existing, data) ? { technicalSource: "Saisie manuelle", technicalConfirmedAt: new Date() } : {};
  const vehicle = await prisma.vehicle.update({ where: { id }, data: { ...fields, ...technical } });
  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "vehicle.update", entityType: "Vehicle", entityId: id, ip: ctx.ip });
  return vehicle;
}

export async function getVehicle(ctx: Ctx, id: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, garageId: ctx.garageId },
    include: {
      customer: true,
      workOrders: {
        orderBy: { createdAt: "desc" },
        include: {
          technician: { select: { firstName: true, lastName: true } },
          estimates: { include: { lines: true, approval: true }, orderBy: { version: "desc" } },
        },
      },
    },
  });
  if (!vehicle) throw new NotFoundError("Véhicule introuvable");
  return vehicle;
}

export async function searchVehicles(ctx: Ctx, q: string, limit = 50) {
  const term = q.trim();
  const plate = normalizePlate(term);
  return prisma.vehicle.findMany({
    where: {
      garageId: ctx.garageId,
      ...(term
        ? {
            OR: [
              ...(plate ? [{ plate: { contains: plate } }] : []),
              { vin: { contains: term.toUpperCase() } },
              { make: { contains: term, mode: "insensitive" as const } },
              { model: { contains: term, mode: "insensitive" as const } },
              { customer: { lastName: { contains: term, mode: "insensitive" as const } } },
              { customer: { firstName: { contains: term, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: { customer: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { workOrders: true } } },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}
