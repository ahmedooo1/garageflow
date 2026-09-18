"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { AppError } from "@/server/lib/errors";
import { getClientIp } from "@/server/lib/request";
import { formToObject } from "@/server/lib/validation";
import { createUser, setUserActive, updateGarageSettings, updateUserRole, type CreateUserInput } from "@/server/services/users";
import { runAction, str, type ActionState } from "./helpers";

export async function createUserAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("users:manage");
    ctx.ip = await getClientIp();
    await createUser(ctx, formToObject(form) as CreateUserInput);
  });
  if (result.ok) revalidatePath("/app/equipe");
  return result;
}

export async function updateUserRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("users:manage");
    ctx.ip = await getClientIp();
    const role = str(form, "role");
    if (!(role in Role)) throw new AppError("Rôle invalide");
    await updateUserRole(ctx, str(form, "userId"), role as Role);
  });
  if (result.ok) revalidatePath("/app/equipe");
  return result;
}

export async function setUserActiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("users:manage");
    ctx.ip = await getClientIp();
    await setUserActive(ctx, str(form, "userId"), str(form, "active") === "1");
  });
  if (result.ok) revalidatePath("/app/equipe");
  return result;
}

export async function updateGarageSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("garage:settings");
    ctx.ip = await getClientIp();
    await updateGarageSettings(ctx, formToObject(form) as Parameters<typeof updateGarageSettings>[1]);
  });
  if (result.ok) revalidatePath("/app", "layout");
  return result;
}
