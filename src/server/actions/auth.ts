"use server";

import { redirect } from "next/navigation";
import { createSession, destroyCurrentSession, getSession } from "@/server/auth/session";
import { AppError } from "@/server/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/lib/rate-limit";
import { getAppUrl, getClientIp, getUserAgent } from "@/server/lib/request";
import { formToObject } from "@/server/lib/validation";
import { authenticate, registerGarage, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { audit } from "@/server/services/audit";
import { runAction, str, type ActionState } from "./helpers";

export async function registerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await getClientIp();
  const result = await runAction(async () => {
    enforceRateLimit(`register:${ip}`, RATE_LIMITS.register);
    const { user } = await registerGarage(formToObject(form) as Parameters<typeof registerGarage>[0], { ip });
    await createSession(user.id, { ip, userAgent: await getUserAgent() });
  });
  if (result.ok) redirect("/app/atelier");
  return result;
}

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await getClientIp();
  const email = str(form, "email").trim().toLowerCase();
  const result = await runAction(async () => {
    enforceRateLimit(`login:${ip}`, RATE_LIMITS.login);
    enforceRateLimit(`login:${email}`, RATE_LIMITS.login);
    const user = await authenticate({ email, password: str(form, "password") }, { ip });
    await createSession(user.id, { ip, userAgent: await getUserAgent() });
  });
  if (result.ok) {
    const next = str(form, "next");
    redirect(next.startsWith("/app/") ? next : "/app/atelier");
  }
  return result;
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await audit({ garageId: session.user.garageId, userId: session.user.id, action: "auth.logout", entityType: "User", entityId: session.user.id, ip: await getClientIp() });
  }
  await destroyCurrentSession();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await getClientIp();
  return runAction(async () => {
    enforceRateLimit(`forgot:${ip}`, RATE_LIMITS.forgotPassword);
    await requestPasswordReset(str(form, "email"), getAppUrl(), { ip });
  });
}

export async function resetPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await getClientIp();
  return runAction(async () => {
    enforceRateLimit(`reset:${ip}`, RATE_LIMITS.forgotPassword);
    const password = str(form, "password");
    if (password !== str(form, "confirm")) throw new AppError("Les deux mots de passe ne correspondent pas");
    await resetPassword(str(form, "token"), password, { ip });
  });
}
