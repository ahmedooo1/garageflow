import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { hasPermission, type Permission } from "@/lib/rbac";
import { getSession, type SessionUser } from "@/server/auth/session";
import { ForbiddenError, UnauthorizedError } from "@/server/lib/errors";

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

/** Pour les server actions / route handlers : session obligatoire sinon 401. */
export async function requireCtx(permission?: Permission): Promise<{ ctx: Ctx; user: SessionUser }> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  const ctx = ctxFromUser(session.user);
  if (permission) assertPermission(ctx, permission);
  return { ctx, user: session.user };
}

/** Pour les pages : redirige vers /login si non connecté. */
export async function requireUser(): Promise<{ ctx: Ctx; user: SessionUser }> {
  const session = await getSession();
  if (!session) redirect("/login");
  return { ctx: ctxFromUser(session.user), user: session.user };
}
