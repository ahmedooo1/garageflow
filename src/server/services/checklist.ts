import { CheckStatus } from "@prisma/client";
import { z } from "zod";
import { CHECKLIST_KEYS, CHECK_STATUS_LABELS, checklistLabel } from "@/lib/labels";
import { prisma } from "@/server/db";
import { assertPermission, type Ctx } from "@/server/context";
import { optionalText, parseOrThrow } from "@/server/lib/validation";
import { addEvent } from "./timeline";
import { assertEditable, getOwnedWorkOrder } from "./workorders";

export const checklistItemSchema = z.object({
  key: z.string().refine((k) => CHECKLIST_KEYS.has(k), "Élément de contrôle inconnu"),
  status: z.nativeEnum(CheckStatus),
  comment: optionalText(1000),
});

export type ChecklistItemInput = z.input<typeof checklistItemSchema>;

export async function updateChecklistItem(ctx: Ctx, workOrderId: string, input: ChecklistItemInput) {
  assertPermission(ctx, "diagnosis:write");
  const data = parseOrThrow(checklistItemSchema, input);
  const wo = await getOwnedWorkOrder(ctx, workOrderId);
  assertEditable(wo.status);
  return prisma.$transaction(async (tx) => {
    const previous = await tx.checklistItem.findUnique({ where: { workOrderId_key: { workOrderId, key: data.key } }, select: { status: true } });
    const item = await tx.checklistItem.upsert({
      where: { workOrderId_key: { workOrderId, key: data.key } },
      create: { garageId: ctx.garageId, workOrderId, key: data.key, status: data.status, comment: data.comment, updatedById: ctx.userId },
      update: { status: data.status, comment: data.comment, updatedById: ctx.userId },
    });
    if (previous?.status !== data.status) {
      await addEvent(
        {
          garageId: ctx.garageId,
          workOrderId,
          type: "CHECKLIST_UPDATED",
          message: `Contrôle : ${checklistLabel(data.key)} → ${CHECK_STATUS_LABELS[data.status]}`,
          actorId: ctx.userId,
        },
        tx,
      );
    }
    return item;
  });
}
