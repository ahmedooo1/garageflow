import { assertPermission, type Ctx } from "@/server/context";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/lib/errors";
import { audit } from "./audit";

/**
 * Export complet des données d'un garage (portabilité RGPD).
 * Les photos ne sont pas incluses : seules leurs métadonnées le sont, les
 * fichiers restant accessibles via l'application.
 */
export async function exportGarageData(ctx: Ctx) {
  assertPermission(ctx, "garage:settings");
  const garage = await prisma.garage.findUnique({
    where: { id: ctx.garageId },
    include: {
      users: { select: { id: true, email: true, firstName: true, lastName: true, role: true, active: true, createdAt: true } },
      customers: { orderBy: { createdAt: "asc" } },
      vehicles: { orderBy: { createdAt: "asc" } },
      workOrders: {
        orderBy: { createdAt: "asc" },
        include: {
          photos: { select: { id: true, type: true, comment: true, storageKey: true, mimeType: true, size: true, createdAt: true } },
          damages: true,
          findings: true,
          checklist: true,
          finalCheck: true,
          events: { orderBy: { createdAt: "asc" } },
          estimates: { orderBy: { version: "asc" }, include: { lines: { orderBy: { position: "asc" } }, approval: true } },
        },
      },
    },
  });
  if (!garage) throw new NotFoundError("Garage introuvable");

  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "garage.export", entityType: "Garage", entityId: ctx.garageId, ip: ctx.ip });

  const { stripeCustomerId, stripeSubscriptionId, ...garageData } = garage;
  void stripeCustomerId;
  void stripeSubscriptionId;
  return {
    exportedAt: new Date().toISOString(),
    format: "garageflow.v1",
    garage: garageData,
  };
}
