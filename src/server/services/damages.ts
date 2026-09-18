import { DamageType } from "@prisma/client";
import { z } from "zod";
import { DAMAGE_TYPE_LABELS } from "@/lib/labels";
import { prisma } from "@/server/db";
import { assertPermission, type Ctx } from "@/server/context";
import { NotFoundError } from "@/server/lib/errors";
import { optionalText, parseOrThrow, requiredText } from "@/server/lib/validation";
import { addEvent } from "./timeline";
import { assertEditable, getOwnedWorkOrder } from "./workorders";

export const damageSchema = z.object({
  type: z.nativeEnum(DamageType),
  location: requiredText("Emplacement", 120),
  description: optionalText(1000),
});

export type DamageInput = z.input<typeof damageSchema>;

export async function addDamage(ctx: Ctx, workOrderId: string, input: DamageInput) {
  assertPermission(ctx, "diagnosis:write");
  const data = parseOrThrow(damageSchema, input);
  const wo = await getOwnedWorkOrder(ctx, workOrderId);
  assertEditable(wo.status);
  return prisma.$transaction(async (tx) => {
    const damage = await tx.damage.create({ data: { ...data, garageId: ctx.garageId, workOrderId, authorId: ctx.userId } });
    await addEvent(
      { garageId: ctx.garageId, workOrderId, type: "DAMAGE_ADDED", message: `Dommage existant : ${DAMAGE_TYPE_LABELS[data.type]} – ${data.location}`, actorId: ctx.userId },
      tx,
    );
    return damage;
  });
}

export async function deleteDamage(ctx: Ctx, damageId: string) {
  assertPermission(ctx, "diagnosis:write");
  const damage = await prisma.damage.findFirst({ where: { id: damageId, garageId: ctx.garageId }, include: { workOrder: { select: { status: true } } } });
  if (!damage) throw new NotFoundError("Dommage introuvable");
  assertEditable(damage.workOrder.status);
  await prisma.damage.delete({ where: { id: damageId } });
}
