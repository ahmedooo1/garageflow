import { FuelType } from "@prisma/client";
import { z } from "zod";
import { normalizePlate } from "@/lib/format";
import { prisma } from "@/server/db";
import { assertPermission, type Ctx } from "@/server/context";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { idField, intField, optionalInt, optionalText, parseOrThrow, requiredText } from "@/server/lib/validation";
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
});

export type VehicleInput = z.input<typeof vehicleSchema>;

export async function createVehicle(ctx: Ctx, input: VehicleInput) {
  assertPermission(ctx, "vehicles:write");
  const data = parseOrThrow(vehicleSchema, input);
  const customer = await prisma.customer.findFirst({ where: { id: data.customerId, garageId: ctx.garageId }, select: { id: true } });
  if (!customer) throw new NotFoundError("Client introuvable");
  const dup = await prisma.vehicle.findUnique({ where: { garageId_plate: { garageId: ctx.garageId, plate: data.plate } }, select: { id: true } });
  if (dup) throw new ConflictError("Un véhicule avec cette immatriculation existe déjà");
  const vehicle = await prisma.vehicle.create({ data: { ...data, garageId: ctx.garageId } });
  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "vehicle.create", entityType: "Vehicle", entityId: vehicle.id, ip: ctx.ip });
  return vehicle;
}

export async function updateVehicle(ctx: Ctx, id: string, input: VehicleInput) {
  assertPermission(ctx, "vehicles:write");
  const data = parseOrThrow(vehicleSchema, input);
  const existing = await prisma.vehicle.findFirst({ where: { id, garageId: ctx.garageId }, select: { id: true } });
  if (!existing) throw new NotFoundError("Véhicule introuvable");
  const customer = await prisma.customer.findFirst({ where: { id: data.customerId, garageId: ctx.garageId }, select: { id: true } });
  if (!customer) throw new NotFoundError("Client introuvable");
  const dup = await prisma.vehicle.findFirst({ where: { garageId: ctx.garageId, plate: data.plate, NOT: { id } }, select: { id: true } });
  if (dup) throw new ConflictError("Un autre véhicule porte déjà cette immatriculation");
  const vehicle = await prisma.vehicle.update({ where: { id }, data });
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
