import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/server/db";

export type TimelineInput = {
  garageId: string;
  workOrderId: string;
  type: string;
  message: string;
  actorId?: string | null;
  actorLabel?: string;
  payload?: Prisma.InputJsonValue;
};

export async function addEvent(input: TimelineInput, tx: Tx | typeof prisma = prisma): Promise<void> {
  await tx.timelineEvent.create({
    data: {
      garageId: input.garageId,
      workOrderId: input.workOrderId,
      type: input.type,
      message: input.message,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel ?? "",
      payload: input.payload,
    },
  });
}
