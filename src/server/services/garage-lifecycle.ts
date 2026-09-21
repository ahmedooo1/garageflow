import { prisma } from "@/server/db";

/**
 * Supprime un garage et l'intégralité de ses données.
 *
 * Les relations vers `User` (auteur d'une photo, d'un constat, d'un jeton…)
 * sont volontairement en `Restrict` : on ne veut pas qu'une suppression
 * d'utilisateur emporte son travail. Cette garantie impose en contrepartie de
 * supprimer les dépendances dans l'ordre lors de l'effacement d'un tenant.
 *
 * Utilisé par le jeu de données de démonstration, par les tests et pour
 * répondre à une demande d'effacement (RGPD). Volontairement absent de
 * l'interface : une suppression de tenant se fait de façon délibérée.
 */
export async function purgeGarage(garageId: string): Promise<void> {
  const workOrders = await prisma.workOrder.findMany({ where: { garageId }, select: { id: true } });
  const workOrderIds = workOrders.map((w) => w.id);
  const estimates = await prisma.estimate.findMany({ where: { garageId }, select: { id: true } });
  const estimateIds = estimates.map((e) => e.id);
  const users = await prisma.user.findMany({ where: { garageId }, select: { id: true } });
  const userIds = users.map((u) => u.id);

  await prisma.$transaction([
    prisma.approvalToken.deleteMany({ where: { estimateId: { in: estimateIds } } }),
    prisma.approval.deleteMany({ where: { garageId } }),
    prisma.estimateLine.deleteMany({ where: { estimateId: { in: estimateIds } } }),
    prisma.estimate.deleteMany({ where: { garageId } }),
    prisma.photo.deleteMany({ where: { garageId } }),
    prisma.damage.deleteMany({ where: { garageId } }),
    prisma.finding.deleteMany({ where: { garageId } }),
    prisma.checklistItem.deleteMany({ where: { garageId } }),
    prisma.finalCheck.deleteMany({ where: { workOrderId: { in: workOrderIds } } }),
    prisma.timelineEvent.deleteMany({ where: { garageId } }),
    prisma.workOrder.deleteMany({ where: { garageId } }),
    prisma.vehicle.deleteMany({ where: { garageId } }),
    prisma.customer.deleteMany({ where: { garageId } }),
    prisma.auditLog.deleteMany({ where: { garageId } }),
    prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { garageId } }),
    prisma.garage.delete({ where: { id: garageId } }),
  ]);
}
