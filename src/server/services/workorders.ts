import { Prisma, type WorkOrderStatus } from "@prisma/client";
import { z } from "zod";
import { CHECKLIST_ITEMS, STATUS_LABELS, ACTIVE_STATUSES } from "@/lib/labels";
import { normalizePlate } from "@/lib/format";
import { assertTransition, getAction, isTerminal, InvalidTransitionError } from "@/lib/state-machine";
import { prisma, type Tx } from "@/server/db";
import { assertPermission, type Ctx } from "@/server/context";
import { AppError, ConflictError, NotFoundError } from "@/server/lib/errors";
import { checkbox, idField, intField, optionalDateTime, optionalId, optionalText, parseOrThrow, requiredText } from "@/server/lib/validation";
import { audit } from "./audit";
import { addEvent } from "./timeline";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Charge un dossier en garantissant qu'il appartient au garage du contexte. */
export async function getOwnedWorkOrder(ctx: Ctx, id: string, tx: Tx | typeof prisma = prisma) {
  const wo = await tx.workOrder.findFirst({ where: { id, garageId: ctx.garageId } });
  if (!wo) throw new NotFoundError("Dossier introuvable");
  return wo;
}

export function assertEditable(status: WorkOrderStatus): void {
  if (isTerminal(status)) throw new ConflictError("Ce dossier est clôturé ou annulé : modification impossible");
}

async function nextNumber(tx: Tx, garageId: string): Promise<string> {
  const garage = await tx.garage.update({
    where: { id: garageId },
    data: { workOrderSeq: { increment: 1 } },
    select: { workOrderSeq: true },
  });
  return `D-${new Date().getFullYear()}-${String(garage.workOrderSeq).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Création (réception)
// ---------------------------------------------------------------------------

export const createWorkOrderSchema = z.object({
  customerId: idField,
  vehicleId: idField,
  mileageIn: intField("Kilométrage", 0, 5_000_000),
  reason: requiredText("Raison de la visite", 300),
  symptoms: optionalText(3000),
  promisedAt: optionalDateTime,
  technicianId: optionalId,
});

export type CreateWorkOrderInput = z.input<typeof createWorkOrderSchema>;

export async function createWorkOrder(ctx: Ctx, input: CreateWorkOrderInput) {
  assertPermission(ctx, "workorders:create");
  const data = parseOrThrow(createWorkOrderSchema, input);

  const vehicle = await prisma.vehicle.findFirst({ where: { id: data.vehicleId, garageId: ctx.garageId } });
  if (!vehicle) throw new NotFoundError("Véhicule introuvable");
  if (vehicle.customerId !== data.customerId) throw new AppError("Le véhicule n'appartient pas à ce client");

  if (data.technicianId) {
    const tech = await prisma.user.findFirst({ where: { id: data.technicianId, garageId: ctx.garageId, active: true }, select: { id: true } });
    if (!tech) throw new NotFoundError("Technicien introuvable");
  }

  const open = await prisma.workOrder.findFirst({
    where: { vehicleId: vehicle.id, garageId: ctx.garageId, status: { in: [...ACTIVE_STATUSES] } },
    select: { number: true },
  });
  if (open) throw new ConflictError(`Ce véhicule a déjà un dossier en cours (${open.number})`);

  return prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.garageId);
    const wo = await tx.workOrder.create({
      data: {
        garageId: ctx.garageId,
        number,
        customerId: data.customerId,
        vehicleId: data.vehicleId,
        technicianId: data.technicianId,
        createdById: ctx.userId,
        mileageIn: data.mileageIn,
        reason: data.reason,
        symptoms: data.symptoms,
        promisedAt: data.promisedAt,
        status: "ARRIVED",
      },
    });
    await tx.checklistItem.createMany({
      data: CHECKLIST_ITEMS.map((item) => ({ garageId: ctx.garageId, workOrderId: wo.id, key: item.key })),
    });
    if (data.mileageIn > vehicle.mileage) {
      await tx.vehicle.update({ where: { id: vehicle.id }, data: { mileage: data.mileageIn } });
    }
    await addEvent(
      {
        garageId: ctx.garageId,
        workOrderId: wo.id,
        type: "WORK_ORDER_CREATED",
        message: `Véhicule réceptionné (${data.mileageIn.toLocaleString("fr-FR")} km) : ${data.reason}`,
        actorId: ctx.userId,
      },
      tx,
    );
    if (data.technicianId) {
      await addEvent({ garageId: ctx.garageId, workOrderId: wo.id, type: "TECHNICIAN_ASSIGNED", message: "Technicien assigné à la réception", actorId: ctx.userId }, tx);
    }
    await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "workorder.create", entityType: "WorkOrder", entityId: wo.id, ip: ctx.ip }, tx);
    return wo;
  });
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export const workOrderDetailInclude = {
  garage: { select: { vatRate: true, name: true } },
  customer: true,
  vehicle: true,
  technician: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  photos: { orderBy: { createdAt: "asc" }, include: { author: { select: { firstName: true, lastName: true } } } },
  damages: { orderBy: { createdAt: "asc" }, include: { photos: true } },
  findings: { orderBy: { createdAt: "asc" }, include: { photos: true, author: { select: { firstName: true, lastName: true } } } },
  checklist: { include: { photos: true } },
  estimates: {
    orderBy: { version: "desc" },
    include: {
      lines: { orderBy: { position: "asc" } },
      approval: true,
      tokens: { select: { id: true, expiresAt: true, revokedAt: true, usedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  },
  events: { orderBy: { createdAt: "desc" }, include: { actor: { select: { firstName: true, lastName: true } } } },
  finalCheck: true,
} satisfies Prisma.WorkOrderInclude;

export type WorkOrderDetail = Prisma.WorkOrderGetPayload<{ include: typeof workOrderDetailInclude }>;

export async function getWorkOrderDetail(ctx: Ctx, id: string): Promise<WorkOrderDetail> {
  const wo = await prisma.workOrder.findFirst({ where: { id, garageId: ctx.garageId }, include: workOrderDetailInclude });
  if (!wo) throw new NotFoundError("Dossier introuvable");
  return wo;
}

export const workOrderCardInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
  vehicle: { select: { id: true, plate: true, make: true, model: true, year: true } },
  technician: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.WorkOrderInclude;

export type WorkOrderCard = Prisma.WorkOrderGetPayload<{ include: typeof workOrderCardInclude }>;

export async function listActiveWorkOrders(ctx: Ctx): Promise<WorkOrderCard[]> {
  return prisma.workOrder.findMany({
    where: { garageId: ctx.garageId, status: { in: [...ACTIVE_STATUSES] } },
    include: workOrderCardInclude,
    orderBy: [{ promisedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

export type ListFilter = { q?: string; status?: WorkOrderStatus | "ACTIVE" | "ALL"; limit?: number };

export async function listWorkOrders(ctx: Ctx, filter: ListFilter = {}): Promise<WorkOrderCard[]> {
  const term = (filter.q ?? "").trim();
  const plate = normalizePlate(term);
  const status = filter.status ?? "ACTIVE";
  return prisma.workOrder.findMany({
    where: {
      garageId: ctx.garageId,
      ...(status === "ACTIVE" ? { status: { in: [...ACTIVE_STATUSES] } } : status === "ALL" ? {} : { status }),
      ...(term
        ? {
            OR: [
              { number: { contains: term.toUpperCase() } },
              ...(plate ? [{ vehicle: { plate: { contains: plate } } }] : []),
              { customer: { lastName: { contains: term, mode: "insensitive" as const } } },
              { customer: { firstName: { contains: term, mode: "insensitive" as const } } },
              { vehicle: { model: { contains: term, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: workOrderCardInclude,
    orderBy: { createdAt: "desc" },
    take: filter.limit ?? 100,
  });
}

// ---------------------------------------------------------------------------
// Modifications
// ---------------------------------------------------------------------------

export async function assignTechnician(ctx: Ctx, id: string, technicianId: string | null) {
  assertPermission(ctx, "workorders:assign");
  const wo = await getOwnedWorkOrder(ctx, id);
  assertEditable(wo.status);
  let label = "Technicien retiré";
  if (technicianId) {
    const tech = await prisma.user.findFirst({ where: { id: technicianId, garageId: ctx.garageId, active: true }, select: { firstName: true, lastName: true } });
    if (!tech) throw new NotFoundError("Technicien introuvable");
    label = `Technicien assigné : ${tech.firstName} ${tech.lastName}`;
  }
  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({ where: { id }, data: { technicianId } });
    await addEvent({ garageId: ctx.garageId, workOrderId: id, type: "TECHNICIAN_ASSIGNED", message: label, actorId: ctx.userId }, tx);
  });
}

const ACTION_EVENTS: Record<string, { type: string; message: string }> = {
  QUEUE_DIAGNOSIS: { type: "STATUS_CHANGED", message: "Mis en attente de diagnostic" },
  START_DIAGNOSIS: { type: "STATUS_CHANGED", message: "Diagnostic commencé" },
  NO_WORK_NEEDED: { type: "VEHICLE_READY", message: "Aucun travaux nécessaire : véhicule prêt" },
  WAIT_PARTS: { type: "STATUS_CHANGED", message: "En attente de pièces" },
  START_REPAIR: { type: "STATUS_CHANGED", message: "Réparation commencée" },
  FINISH_REPAIR: { type: "STATUS_CHANGED", message: "Réparation terminée, passage au contrôle final" },
  BACK_TO_REPAIR: { type: "STATUS_CHANGED", message: "Retour en réparation après contrôle" },
  MARK_READY: { type: "VEHICLE_READY", message: "Véhicule prêt pour restitution" },
  CLOSE: { type: "WORK_ORDER_CLOSED", message: "Dossier clôturé" },
  CANCEL: { type: "WORK_ORDER_CANCELLED", message: "Dossier annulé" },
};

/** Transition manuelle pilotée par une action nommée (voir state-machine.ts). */
export async function applyAction(ctx: Ctx, id: string, actionKey: string) {
  const action = getAction(actionKey);
  if (!action) throw new AppError("Action inconnue");
  assertPermission(ctx, action.permission);
  const wo = await getOwnedWorkOrder(ctx, id);
  if (!action.from.includes(wo.status)) throw new InvalidTransitionError(wo.status, action.to);
  assertTransition(wo.status, action.to);
  if (action.requiresFinalCheck) {
    const check = await prisma.finalCheck.findUnique({ where: { workOrderId: id }, select: { id: true } });
    if (!check) throw new AppError("Enregistrez d'abord le contrôle final");
  }
  const event = ACTION_EVENTS[action.key] ?? { type: "STATUS_CHANGED", message: `Statut : ${STATUS_LABELS[action.to]}` };
  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        status: action.to,
        ...(action.to === "CLOSED" ? { closedAt: new Date() } : {}),
        ...(action.to === "CANCELLED" ? { cancelledAt: new Date() } : {}),
      },
    });
    await addEvent(
      { garageId: ctx.garageId, workOrderId: id, type: event.type, message: event.message, actorId: ctx.userId, payload: { from: wo.status, to: action.to } },
      tx,
    );
    await audit(
      { garageId: ctx.garageId, userId: ctx.userId, action: `workorder.${action.key.toLowerCase()}`, entityType: "WorkOrder", entityId: id, ip: ctx.ip, metadata: { from: wo.status, to: action.to } },
      tx,
    );
  });
  return action.to;
}

/** Transition système (appelée par les services estimation / validation). */
export async function transitionStatus(
  tx: Tx,
  ctx: { garageId: string; userId?: string | null },
  wo: { id: string; status: WorkOrderStatus },
  to: WorkOrderStatus,
  event: { type: string; message: string; actorLabel?: string; payload?: Prisma.InputJsonValue },
) {
  assertTransition(wo.status, to);
  await tx.workOrder.update({ where: { id: wo.id }, data: { status: to } });
  await addEvent(
    { garageId: ctx.garageId, workOrderId: wo.id, type: event.type, message: event.message, actorId: ctx.userId ?? null, actorLabel: event.actorLabel, payload: event.payload ?? { from: wo.status, to } },
    tx,
  );
}

// ---------------------------------------------------------------------------
// Contrôle final & restitution
// ---------------------------------------------------------------------------

export const finalCheckSchema = z.object({
  roadTest: checkbox,
  fluids: checkbox,
  warningLights: checkbox,
  toolsRemoved: checkbox,
  cleaned: checkbox,
  comment: optionalText(2000),
});

export async function saveFinalCheck(ctx: Ctx, id: string, input: z.input<typeof finalCheckSchema>) {
  assertPermission(ctx, "repair:transition");
  const data = parseOrThrow(finalCheckSchema, input);
  const wo = await getOwnedWorkOrder(ctx, id);
  if (wo.status !== "QUALITY_CONTROL") throw new ConflictError("Le contrôle final se fait à l'étape « Contrôle final »");
  await prisma.$transaction(async (tx) => {
    await tx.finalCheck.upsert({
      where: { workOrderId: id },
      create: { workOrderId: id, checkedById: ctx.userId, ...data },
      update: { checkedById: ctx.userId, checkedAt: new Date(), ...data },
    });
    await addEvent({ garageId: ctx.garageId, workOrderId: id, type: "FINAL_CHECK_SAVED", message: "Contrôle final enregistré", actorId: ctx.userId }, tx);
  });
}

export const deliverSchema = z.object({
  mileageOut: intField("Kilométrage", 0, 5_000_000),
  comment: optionalText(2000),
});

export async function deliverVehicle(ctx: Ctx, id: string, input: z.input<typeof deliverSchema>) {
  assertPermission(ctx, "workorders:deliver");
  const data = parseOrThrow(deliverSchema, input);
  const wo = await getOwnedWorkOrder(ctx, id);
  if (wo.status !== "READY_FOR_PICKUP") throw new ConflictError("Le véhicule doit être marqué prêt avant restitution");
  if (data.mileageOut < wo.mileageIn) throw new AppError("Le kilométrage de sortie ne peut pas être inférieur au kilométrage d'entrée");
  await prisma.$transaction(async (tx) => {
    assertTransition(wo.status, "DELIVERED");
    await tx.workOrder.update({ where: { id }, data: { status: "DELIVERED", deliveredAt: new Date(), mileageOut: data.mileageOut } });
    await tx.vehicle.updateMany({ where: { id: wo.vehicleId, mileage: { lt: data.mileageOut } }, data: { mileage: data.mileageOut } });
    await addEvent(
      {
        garageId: ctx.garageId,
        workOrderId: id,
        type: "VEHICLE_DELIVERED",
        message: `Véhicule restitué au client (${data.mileageOut.toLocaleString("fr-FR")} km)${data.comment ? " : " + data.comment : ""}`,
        actorId: ctx.userId,
      },
      tx,
    );
    await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "workorder.deliver", entityType: "WorkOrder", entityId: id, ip: ctx.ip }, tx);
  });
}
