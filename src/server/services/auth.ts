import { z } from "zod";
import { prisma } from "@/server/db";
import { generateToken, sha256 } from "@/server/lib/crypto";
import { AppError, ConflictError, UnauthorizedError } from "@/server/lib/errors";
import { sendMail } from "@/server/lib/mailer";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/server/lib/password";
import { emailField, parseOrThrow, passwordField, requiredText } from "@/server/lib/validation";
import { audit } from "./audit";

export const registerSchema = z.object({
  garageName: requiredText("Nom du garage", 120),
  firstName: requiredText("Prénom", 80),
  lastName: requiredText("Nom", 80),
  email: emailField,
  password: passwordField,
  phone: z.string().trim().max(30).default(""),
});

export type RegisterInput = z.input<typeof registerSchema>;

/** Crée un garage et son premier utilisateur (OWNER). */
export async function registerGarage(input: RegisterInput, meta: { ip?: string } = {}) {
  const data = parseOrThrow(registerSchema, input);
  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) throw new ConflictError("Un compte existe déjà avec cet email");

  const passwordHash = await hashPassword(data.password);
  const result = await prisma.$transaction(async (tx) => {
    const garage = await tx.garage.create({ data: { name: data.garageName, phone: data.phone } });
    const user = await tx.user.create({
      data: {
        garageId: garage.id,
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: "OWNER",
      },
    });
    await audit(
      { garageId: garage.id, userId: user.id, action: "garage.register", entityType: "Garage", entityId: garage.id, ip: meta.ip },
      tx,
    );
    return { garage, user };
  });
  return result;
}

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Mot de passe obligatoire").max(200),
});

export type LoginInput = z.input<typeof loginSchema>;

export async function authenticate(input: LoginInput, meta: { ip?: string } = {}) {
  const data = parseOrThrow(loginSchema, input);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  // Comparaison même si l'utilisateur n'existe pas (temps de réponse constant).
  const ok = await verifyPassword(data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    await audit({ action: "auth.login_failed", entityType: "User", entityId: user?.id ?? "", ip: meta.ip, metadata: { email: data.email } });
    throw new UnauthorizedError("Email ou mot de passe incorrect");
  }
  await audit({ garageId: user.garageId, userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ip: meta.ip });
  return user;
}

export const RESET_TTL_MS = 60 * 60 * 1000;

/** Génère un lien de réinitialisation (réponse identique que l'email existe ou non). */
export async function requestPasswordReset(emailRaw: string, appUrl: string, meta: { ip?: string } = {}): Promise<void> {
  const email = parseOrThrow(emailField, emailRaw);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, active: true, garageId: true } });
  if (!user || !user.active) return;
  const token = generateToken(32);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  await audit({ garageId: user.garageId, userId: user.id, action: "auth.reset_requested", entityType: "User", entityId: user.id, ip: meta.ip });
  await sendMail({
    to: email,
    subject: "GarageFlow : réinitialisation de votre mot de passe",
    text: `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${appUrl}/reset-password/${token}`,
  });
}

export async function resetPassword(token: string, newPassword: string, meta: { ip?: string } = {}): Promise<void> {
  const password = parseOrThrow(passwordField, newPassword);
  if (!token || token.length < 20) throw new AppError("Lien invalide ou expiré");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new AppError("Lien invalide ou expiré");
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: record.userId } });
    await audit({ garageId: record.user.garageId, userId: record.userId, action: "auth.password_reset", entityType: "User", entityId: record.userId, ip: meta.ip }, tx);
  });
}
