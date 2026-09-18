import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { assertPermission, type Ctx } from "@/server/context";
import { AppError, ConflictError, NotFoundError } from "@/server/lib/errors";
import { hashPassword } from "@/server/lib/password";
import { emailField, parseOrThrow, passwordField, requiredText } from "@/server/lib/validation";
import { audit } from "./audit";

export const createUserSchema = z.object({
  firstName: requiredText("Prénom", 80),
  lastName: requiredText("Nom", 80),
  email: emailField,
  password: passwordField,
  role: z.nativeEnum(Role),
});

export type CreateUserInput = z.input<typeof createUserSchema>;

export async function listUsers(ctx: Ctx) {
  return prisma.user.findMany({
    where: { garageId: ctx.garageId },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, active: true, createdAt: true },
    orderBy: [{ role: "asc" }, { lastName: "asc" }],
  });
}

export async function listTechnicians(ctx: Ctx) {
  return prisma.user.findMany({
    where: { garageId: ctx.garageId, active: true },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ lastName: "asc" }],
  });
}

export async function createUser(ctx: Ctx, input: CreateUserInput) {
  assertPermission(ctx, "users:manage");
  const data = parseOrThrow(createUserSchema, input);
  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) throw new ConflictError("Un compte existe déjà avec cet email");
  const user = await prisma.user.create({
    data: {
      garageId: ctx.garageId,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
    },
    select: { id: true, email: true, role: true },
  });
  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "user.create", entityType: "User", entityId: user.id, ip: ctx.ip, metadata: { role: user.role } });
  return user;
}

export async function updateUserRole(ctx: Ctx, userId: string, role: Role) {
  assertPermission(ctx, "users:manage");
  const target = await prisma.user.findFirst({ where: { id: userId, garageId: ctx.garageId }, select: { id: true, role: true } });
  if (!target) throw new NotFoundError("Utilisateur introuvable");
  if (target.id === ctx.userId && role !== "OWNER") throw new AppError("Vous ne pouvez pas retirer votre propre rôle de gérant");
  const parsed = parseOrThrow(z.nativeEnum(Role), role);
  await prisma.user.update({ where: { id: userId }, data: { role: parsed } });
  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "user.role", entityType: "User", entityId: userId, ip: ctx.ip, metadata: { role: parsed } });
}

export async function setUserActive(ctx: Ctx, userId: string, active: boolean) {
  assertPermission(ctx, "users:manage");
  const target = await prisma.user.findFirst({ where: { id: userId, garageId: ctx.garageId }, select: { id: true } });
  if (!target) throw new NotFoundError("Utilisateur introuvable");
  if (target.id === ctx.userId) throw new AppError("Vous ne pouvez pas désactiver votre propre compte");
  await prisma.user.update({ where: { id: userId }, data: { active } });
  if (!active) await prisma.session.deleteMany({ where: { userId } });
  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: active ? "user.activate" : "user.deactivate", entityType: "User", entityId: userId, ip: ctx.ip });
}

export const garageSettingsSchema = z.object({
  name: requiredText("Nom du garage", 120),
  address: z.string().trim().max(300).default(""),
  phone: z.string().trim().max(30).default(""),
  email: z.string().trim().max(200).default(""),
  siret: z.string().trim().max(20).default(""),
  vatRate: z.coerce.number().min(0).max(100).default(20),
});

export async function updateGarageSettings(ctx: Ctx, input: z.input<typeof garageSettingsSchema>) {
  assertPermission(ctx, "garage:settings");
  const data = parseOrThrow(garageSettingsSchema, input);
  await prisma.garage.update({ where: { id: ctx.garageId }, data });
  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "garage.settings", entityType: "Garage", entityId: ctx.garageId, ip: ctx.ip });
}

export async function getGarage(ctx: Ctx) {
  const garage = await prisma.garage.findUnique({ where: { id: ctx.garageId } });
  if (!garage) throw new NotFoundError("Garage introuvable");
  return garage;
}
