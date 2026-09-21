import { cache } from "react";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "@/server/db";
import { generateToken, sha256 } from "@/server/lib/crypto";

export const SESSION_COOKIE = "gf_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  garageId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  platformAdmin: boolean;
  garageName: string;
};

export type SessionInfo = { sessionId: string; user: SessionUser };

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

/** Crée une session DB et pose le cookie. Retourne le jeton brut (jamais stocké). */
export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}): Promise<string> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, ip: meta.ip ?? "", userAgent: meta.userAgent ?? "" },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
  return token;
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  store.set(SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}

/** Résout la session courante depuis le cookie (mémoïsé par requête). */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || token.length < 20) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { garage: { select: { name: true } } } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!session.user.active) return null;
  const u = session.user;
  return {
    sessionId: session.id,
    user: {
      id: u.id,
      garageId: u.garageId,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      platformAdmin: u.platformAdmin,
      garageName: u.garage.name,
    },
  };
});
