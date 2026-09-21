"use server";

import type { Plan } from "@prisma/client";
import { redirect } from "next/navigation";
import { PLANS } from "@/lib/plans";
import { requireCtx } from "@/server/context";
import { AppError } from "@/server/lib/errors";
import { getAppUrl, getClientIp } from "@/server/lib/request";
import { createCheckoutSession, createPortalSession } from "@/server/services/billing";
import { runAction, str, type ActionState } from "./helpers";

export async function startCheckoutAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    // Autorisé même essai expiré : c'est précisément l'action qui régularise.
    const { ctx } = await requireCtx("garage:settings", { allowExpired: true });
    ctx.ip = await getClientIp();
    const plan = str(form, "plan") as Plan;
    if (!PLANS[plan]) throw new AppError("Plan inconnu");
    return { url: await createCheckoutSession(ctx, plan, getAppUrl()) };
  });
  if (result.ok && result.data) redirect(result.data.url);
  return { ok: false, error: result.error, fields: result.fields, seq: result.seq };
}

export async function openPortalAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("garage:settings", { allowExpired: true });
    ctx.ip = await getClientIp();
    return { url: await createPortalSession(ctx, getAppUrl()) };
  });
  if (result.ok && result.data) redirect(result.data.url);
  return { ok: false, error: result.error, fields: result.fields, seq: result.seq };
}
