import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { sha256 } from "@/server/lib/crypto";
import { ConflictError, RateLimitError, UnauthorizedError, ValidationError } from "@/server/lib/errors";
import * as emails from "@/server/services/emails";
import { enforceRateLimit, RATE_LIMITS } from "@/server/lib/rate-limit";
import { authenticate, registerGarage, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { cleanupGarage, createTestGarage, PASSWORD } from "./helpers";

const created: string[] = [];
afterAll(async () => {
  for (const id of created) await cleanupGarage(id);
});

describe("authentification", () => {
  it("inscrit un garage avec un gérant et hache le mot de passe", async () => {
    const g = await createTestGarage("Auth");
    created.push(g.garageId);
    const user = await prisma.user.findUnique({ where: { email: g.ownerEmail } });
    expect(user?.role).toBe("OWNER");
    expect(user?.passwordHash).not.toContain(PASSWORD);
    expect(user?.passwordHash.startsWith("$2")).toBe(true);
  });

  it("refuse un email déjà utilisé et un mot de passe trop court", async () => {
    const g = await createTestGarage("Auth2");
    created.push(g.garageId);
    await expect(registerGarage({ garageName: "X", firstName: "A", lastName: "B", email: g.ownerEmail, password: PASSWORD })).rejects.toBeInstanceOf(ConflictError);
    await expect(registerGarage({ garageName: "X", firstName: "A", lastName: "B", email: "new@test.local", password: "court" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("authentifie avec le bon mot de passe et rejette le mauvais", async () => {
    const g = await createTestGarage("Auth3");
    created.push(g.garageId);
    const user = await authenticate({ email: g.ownerEmail.toUpperCase(), password: PASSWORD });
    expect(user.garageId).toBe(g.garageId);
    await expect(authenticate({ email: g.ownerEmail, password: "mauvais-mot-de-passe" })).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(authenticate({ email: "inconnu@test.local", password: PASSWORD })).rejects.toBeInstanceOf(UnauthorizedError);
    const failed = await prisma.auditLog.findFirst({ where: { action: "auth.login_failed", userId: null }, orderBy: { createdAt: "desc" } });
    expect(failed).not.toBeNull();
  });

  it("refuse un compte désactivé", async () => {
    const g = await createTestGarage("Auth4");
    created.push(g.garageId);
    await prisma.user.update({ where: { id: g.technician.userId }, data: { active: false } });
    await expect(authenticate({ email: g.technicianEmail, password: PASSWORD })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("limite les tentatives de connexion", () => {
    for (let i = 0; i < RATE_LIMITS.login.limit; i++) enforceRateLimit("login:ip-test", RATE_LIMITS.login);
    expect(() => enforceRateLimit("login:ip-test", RATE_LIMITS.login)).toThrow(RateLimitError);
  });

  it("réinitialise le mot de passe via un lien à usage unique et invalide les sessions", async () => {
    const g = await createTestGarage("Auth5");
    created.push(g.garageId);
    await prisma.session.create({ data: { userId: g.owner.userId, tokenHash: sha256("old-session"), expiresAt: new Date(Date.now() + 60_000) } });
    const spy = vi.spyOn(emails, "sendPasswordResetEmail").mockResolvedValue();
    await requestPasswordReset(g.ownerEmail, "http://localhost:3000");
    expect(spy).toHaveBeenCalledTimes(1);
    const token = spy.mock.calls[0][0].url.match(/reset-password\/([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();
    // Email inconnu : aucune fuite, aucun mail.
    await requestPasswordReset("nobody@test.local", "http://localhost:3000");
    expect(spy).toHaveBeenCalledTimes(1);

    await resetPassword(token!, "Nouveau-Mot-De-Passe-99");
    await expect(authenticate({ email: g.ownerEmail, password: PASSWORD })).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(authenticate({ email: g.ownerEmail, password: "Nouveau-Mot-De-Passe-99" })).resolves.toBeTruthy();
    expect(await prisma.session.count({ where: { userId: g.owner.userId } })).toBe(0);
    await expect(resetPassword(token!, "Encore-Un-Autre-Mdp-1")).rejects.toThrow(/invalide/);
    spy.mockRestore();
  });
});
