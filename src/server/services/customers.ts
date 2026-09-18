import { z } from "zod";
import { prisma } from "@/server/db";
import { assertPermission, type Ctx } from "@/server/context";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { optionalEmail, optionalText, parseOrThrow, requiredText } from "@/server/lib/validation";
import { audit } from "./audit";

export const customerSchema = z.object({
  firstName: requiredText("Prénom", 80),
  lastName: requiredText("Nom", 80),
  phone: z.string().trim().max(30).default(""),
  email: optionalEmail,
  address: optionalText(300),
  notes: optionalText(2000),
});

export type CustomerInput = z.input<typeof customerSchema>;

export async function createCustomer(ctx: Ctx, input: CustomerInput) {
  assertPermission(ctx, "customers:write");
  const data = parseOrThrow(customerSchema, input);
  const customer = await prisma.customer.create({ data: { ...data, garageId: ctx.garageId } });
  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "customer.create", entityType: "Customer", entityId: customer.id, ip: ctx.ip });
  return customer;
}

export async function updateCustomer(ctx: Ctx, id: string, input: CustomerInput) {
  assertPermission(ctx, "customers:write");
  const data = parseOrThrow(customerSchema, input);
  const existing = await prisma.customer.findFirst({ where: { id, garageId: ctx.garageId }, select: { id: true } });
  if (!existing) throw new NotFoundError("Client introuvable");
  const customer = await prisma.customer.update({ where: { id }, data });
  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "customer.update", entityType: "Customer", entityId: id, ip: ctx.ip });
  return customer;
}

export async function deleteCustomer(ctx: Ctx, id: string) {
  assertPermission(ctx, "customers:write");
  const existing = await prisma.customer.findFirst({
    where: { id, garageId: ctx.garageId },
    select: { id: true, _count: { select: { workOrders: true } } },
  });
  if (!existing) throw new NotFoundError("Client introuvable");
  if (existing._count.workOrders > 0) {
    throw new ConflictError("Impossible de supprimer un client ayant des dossiers");
  }
  await prisma.customer.delete({ where: { id } });
  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "customer.delete", entityType: "Customer", entityId: id, ip: ctx.ip });
}

export async function getCustomer(ctx: Ctx, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, garageId: ctx.garageId },
    include: {
      vehicles: { orderBy: { createdAt: "desc" } },
      workOrders: {
        orderBy: { createdAt: "desc" },
        include: { vehicle: true, technician: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!customer) throw new NotFoundError("Client introuvable");
  return customer;
}

export async function searchCustomers(ctx: Ctx, q: string, limit = 50) {
  const term = q.trim();
  const digits = term.replace(/\D/g, "");
  return prisma.customer.findMany({
    where: {
      garageId: ctx.garageId,
      ...(term
        ? {
            OR: [
              { lastName: { contains: term, mode: "insensitive" } },
              { firstName: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              { vehicles: { some: { plate: { contains: term.toUpperCase().replace(/[^A-Z0-9]/g, "") } } } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { vehicles: true, workOrders: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: limit,
  });
}
