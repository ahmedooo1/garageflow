"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { getClientIp } from "@/server/lib/request";
import { formToObject } from "@/server/lib/validation";
import { createCustomer, deleteCustomer, updateCustomer, type CustomerInput } from "@/server/services/customers";
import { runAction, str, type ActionState } from "./helpers";

export async function createCustomerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("customers:write");
    ctx.ip = await getClientIp();
    const customer = await createCustomer(ctx, formToObject(form) as CustomerInput);
    return { id: customer.id };
  });
  if (result.ok && result.data) {
    revalidatePath("/app/clients");
    const returnTo = str(form, "returnTo");
    if (returnTo.startsWith("/app/")) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}customerId=${result.data.id}`);
    redirect(`/app/clients/${result.data.id}`);
  }
  return { ok: false, error: result.error, fields: result.fields, seq: result.seq };
}

export async function updateCustomerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "id");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("customers:write");
    ctx.ip = await getClientIp();
    await updateCustomer(ctx, id, formToObject(form) as CustomerInput);
  });
  if (result.ok) {
    revalidatePath(`/app/clients/${id}`);
    redirect(`/app/clients/${id}`);
  }
  return result;
}

export async function deleteCustomerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "id");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("customers:write");
    ctx.ip = await getClientIp();
    await deleteCustomer(ctx, id);
  });
  if (result.ok) {
    revalidatePath("/app/clients");
    redirect("/app/clients");
  }
  return result;
}
