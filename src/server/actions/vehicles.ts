"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { getClientIp } from "@/server/lib/request";
import { formToObject } from "@/server/lib/validation";
import { createVehicle, updateVehicle, type VehicleInput } from "@/server/services/vehicles";
import { runAction, str, type ActionState } from "./helpers";

export async function createVehicleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("vehicles:write");
    ctx.ip = await getClientIp();
    const vehicle = await createVehicle(ctx, formToObject(form) as VehicleInput);
    return { id: vehicle.id, customerId: vehicle.customerId };
  });
  if (result.ok && result.data) {
    revalidatePath("/app/vehicules");
    const returnTo = str(form, "returnTo");
    if (returnTo.startsWith("/app/")) {
      const sep = returnTo.includes("?") ? "&" : "?";
      redirect(`${returnTo}${sep}customerId=${result.data.customerId}&vehicleId=${result.data.id}`);
    }
    redirect(`/app/vehicules/${result.data.id}`);
  }
  return { ok: false, error: result.error, fields: result.fields, seq: result.seq };
}

export async function updateVehicleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "id");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("vehicles:write");
    ctx.ip = await getClientIp();
    await updateVehicle(ctx, id, formToObject(form) as VehicleInput);
  });
  if (result.ok) {
    revalidatePath(`/app/vehicules/${id}`);
    redirect(`/app/vehicules/${id}`);
  }
  return result;
}
