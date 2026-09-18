import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/server/db";

export type AuditInput = {
  garageId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
};

/** Journal d'audit des actions critiques (auth, tenant, validation client, transitions). */
export async function audit(input: AuditInput, tx: Tx | typeof prisma = prisma): Promise<void> {
  await tx.auditLog.create({
    data: {
      garageId: input.garageId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? "",
      metadata: input.metadata,
      ip: input.ip ?? "",
    },
  });
}
