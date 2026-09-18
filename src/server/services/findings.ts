import { Urgency } from "@prisma/client";
import { z } from "zod";
import { URGENCY_LABELS } from "@/lib/labels";
import { prisma } from "@/server/db";
import { assertPermission, type Ctx } from "@/server/context";
import { NotFoundError } from "@/server/lib/errors";
import { optionalText, parseOrThrow, requiredText } from "@/server/lib/validation";
import { addEvent } from "./timeline";
import { assertEditable, getOwnedWorkOrder } from "./workorders";

export const findingSchema = z.object({
  title: requiredText("Titre", 150),
  category: requiredText("Catégorie", 60),
  description: optionalText(3000),
  urgency: z.nativeEnum(Urgency),
});

export type FindingInput = z.input<typeof findingSchema>;

export async function addFinding(ctx: Ctx, workOrderId: string, input: FindingInput) {
  assertPermission(ctx, "diagnosis:write");
  const data = parseOrThrow(findingSchema, input);
  const wo = await getOwnedWorkOrder(ctx, workOrderId);
  assertEditable(wo.status);
  return prisma.$transaction(async (tx) => {
    const finding = await tx.finding.create({ data: { ...data, garageId: ctx.garageId, workOrderId, authorId: ctx.userId } });
    await addEvent(
      { garageId: ctx.garageId, workOrderId, type: "FINDING_ADDED", message: `Constat : ${data.title} (${URGENCY_LABELS[data.urgency]})`, actorId: ctx.userId },
      tx,
    );
    return finding;
  });
}

export async function deleteFinding(ctx: Ctx, findingId: string) {
  assertPermission(ctx, "diagnosis:write");
  const finding = await prisma.finding.findFirst({ where: { id: findingId, garageId: ctx.garageId }, include: { workOrder: { select: { status: true } } } });
  if (!finding) throw new NotFoundError("Constat introuvable");
  assertEditable(finding.workOrder.status);
  await prisma.$transaction(async (tx) => {
    await tx.finding.delete({ where: { id: findingId } });
    await addEvent({ garageId: ctx.garageId, workOrderId: finding.workOrderId, type: "FINDING_DELETED", message: `Constat supprimé : ${finding.title}`, actorId: ctx.userId }, tx);
  });
}
