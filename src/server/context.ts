import { cache } from "react";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { evaluateAccess, type AccessState } from "@/lib/plans";
import { hasPermission, type Permission } from "@/lib/rbac";
import { getSession, type SessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ForbiddenError, SubscriptionError, UnauthorizedError } from "@/server/lib/errors";

/**
 * Contexte d'exécution des services : identifie le garage (tenant) et
 * l'utilisateur. Tous les services filtrent systématiquement par `garageId`.
 */
export type Ctx = {
  garageId: string;
  userId: string;
  role: Role;
  ip?: string;
};

export function ctxFromUser(user: SessionUser, ip?: string): Ctx {
  return { garageId: user.garageId, userId: user.id, role: user.role, ip };
}

export function assertPermission(ctx: Ctx, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new ForbiddenError("Votre rôle ne permet pas cette action");
  }
}

/** Droits d'abonnement du garage courant (mémoïsé par requête). */
export const getGarageAccess = cache(async (garageId: string): Promise<AccessState> => {
  const garage = await prisma.garage.findUnique({
    where: { id: garageId },
    select: {
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      suspendedAt: true,
      suspendedReason: true,
    },
  });
  if (!garage) throw new UnauthorizedError();
  return evaluateAccess({
    plan: garage.plan,
    status: garage.subscriptionStatus,
    trialEndsAt: garage.trialEndsAt,
    currentPeriodEnd: garage.currentPeriodEnd,
    cancelAtPeriodEnd: garage.cancelAtPeriodEnd,
    suspendedAt: garage.suspendedAt,
    suspendedReason: garage.suspendedReason,
  });
});

export async function assertCanWrite(garageId: string): Promise<void> {
  const access = await getGarageAccess(garageId);
  if (!access.canWrite) throw new SubscriptionError(access.reason ?? undefined);
}

export type RequireCtxOptions = {
  /**
   * Autorise l'action même sans abonnement actif. Réservé aux actions qui
   * permettent justement de régulariser la situation (abonnement, export).
   */
  allowExpired?: boolean;
};

/**
 * Pour les server actions et route handlers : session obligatoire sinon 401.
 * Par défaut l'abonnement doit couvrir l'écriture, puisque toutes les actions
 * mutent des données.
 */
export async function requireCtx(permission?: Permission, options: RequireCtxOptions = {}): Promise<{ ctx: Ctx; user: SessionUser }> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  const ctx = ctxFromUser(session.user);
  if (permission) assertPermission(ctx, permission);
  if (!options.allowExpired) await assertCanWrite(ctx.garageId);
  return { ctx, user: session.user };
}

/** Pour les pages : redirige vers /login si non connecté. La lecture reste ouverte. */
export async function requireUser(): Promise<{ ctx: Ctx; user: SessionUser; access: AccessState }> {
  const session = await getSession();
  if (!session) redirect("/login");
  const ctx = ctxFromUser(session.user);
  return { ctx, user: session.user, access: await getGarageAccess(ctx.garageId) };
}

/** Pour la console plateforme : réservée aux administrateurs GarageFlow. */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.platformAdmin) redirect("/app/atelier");
  return session.user;
}

export async function requirePlatformAdminAction(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  if (!session.user.platformAdmin) throw new ForbiddenError("Accès réservé à l'équipe GarageFlow");
  return session.user;
}
