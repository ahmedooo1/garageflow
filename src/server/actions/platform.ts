"use server";

import type { Plan } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { PLANS } from "@/lib/plans";
import { requirePlatformAdminAction } from "@/server/context";
import { AppError } from "@/server/lib/errors";
import { activateManually } from "@/server/services/billing";
import { extendTrial, suspendGarage, unsuspendGarage } from "@/server/services/platform";
import { runAction, str, type ActionState } from "./helpers";

export async function extendTrialAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await extendTrial(str(form, "garageId"), Number(str(form, "days") || 14), admin.id);
  });
  if (result.ok) revalidatePath("/admin");
  return result;
}

export async function activatePlanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    const plan = str(form, "plan") as Plan;
    if (!PLANS[plan]) throw new AppError("Plan inconnu");
    await activateManually(str(form, "garageId"), { plan, months: Number(str(form, "months") || 12) }, admin.id);
  });
  if (result.ok) revalidatePath("/admin");
  return result;
}

export async function suspendGarageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await suspendGarage(str(form, "garageId"), str(form, "reason"), admin.id);
  });
  if (result.ok) revalidatePath("/admin");
  return result;
}

export async function unsuspendGarageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await unsuspendGarage(str(form, "garageId"), admin.id);
  });
  if (result.ok) revalidatePath("/admin");
  return result;
}
