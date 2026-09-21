"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { getAppUrl, getClientIp } from "@/server/lib/request";
import { formToObject } from "@/server/lib/validation";
import { updateChecklistItem, type ChecklistItemInput } from "@/server/services/checklist";
import { addDamage, deleteDamage, type DamageInput } from "@/server/services/damages";
import { addLine, regenerateLink, removeLine, reviseEstimate, sendEstimate, setLineWorkStatus, type EstimateLineInput } from "@/server/services/estimates";
import { addFinding, deleteFinding, type FindingInput } from "@/server/services/findings";
import { deletePhoto } from "@/server/services/photos";
import {
  applyAction,
  assignTechnician,
  createWorkOrder,
  deliverVehicle,
  saveFinalCheck,
  type CreateWorkOrderInput,
} from "@/server/services/workorders";
import { runAction, str, type ActionState } from "./helpers";

function refresh(workOrderId: string) {
  revalidatePath(`/app/dossiers/${workOrderId}`);
  revalidatePath("/app/atelier");
  revalidatePath("/app/dossiers");
}

export async function createWorkOrderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("workorders:create");
    ctx.ip = await getClientIp();
    const wo = await createWorkOrder(ctx, formToObject(form) as CreateWorkOrderInput);
    return { id: wo.id };
  });
  if (result.ok && result.data) {
    revalidatePath("/app/atelier");
    redirect(`/app/dossiers/${result.data.id}?tab=photos&new=1`);
  }
  return { ok: false, error: result.error, fields: result.fields, seq: result.seq };
}

export async function assignTechnicianAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("workorders:assign");
    ctx.ip = await getClientIp();
    await assignTechnician(ctx, id, str(form, "technicianId") || null);
  });
  if (result.ok) refresh(id);
  return result;
}

export async function workOrderActionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx();
    ctx.ip = await getClientIp();
    await applyAction(ctx, id, str(form, "action"));
  });
  if (result.ok) refresh(id);
  return result;
}

export async function saveFinalCheckAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("repair:transition");
    ctx.ip = await getClientIp();
    await saveFinalCheck(ctx, id, formToObject(form) as Parameters<typeof saveFinalCheck>[2]);
  });
  if (result.ok) refresh(id);
  return result;
}

export async function deliverVehicleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("workorders:deliver");
    ctx.ip = await getClientIp();
    await deliverVehicle(ctx, id, formToObject(form) as Parameters<typeof deliverVehicle>[2]);
  });
  if (result.ok) {
    refresh(id);
    redirect(`/app/dossiers/${id}?tab=delivery`);
  }
  return result;
}

// --- Diagnostic -------------------------------------------------------------

export async function addFindingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("diagnosis:write");
    ctx.ip = await getClientIp();
    await addFinding(ctx, id, formToObject(form) as FindingInput);
  });
  if (result.ok) refresh(id);
  return result;
}

export async function deleteFindingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("diagnosis:write");
    ctx.ip = await getClientIp();
    await deleteFinding(ctx, str(form, "findingId"));
  });
  if (result.ok) refresh(id);
  return result;
}

export async function addDamageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("diagnosis:write");
    ctx.ip = await getClientIp();
    await addDamage(ctx, id, formToObject(form) as DamageInput);
  });
  if (result.ok) refresh(id);
  return result;
}

export async function deleteDamageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("diagnosis:write");
    ctx.ip = await getClientIp();
    await deleteDamage(ctx, str(form, "damageId"));
  });
  if (result.ok) refresh(id);
  return result;
}

export async function updateChecklistAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("diagnosis:write");
    ctx.ip = await getClientIp();
    await updateChecklistItem(ctx, id, formToObject(form) as ChecklistItemInput);
  });
  if (result.ok) refresh(id);
  return result;
}

export async function deletePhotoAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("diagnosis:write");
    ctx.ip = await getClientIp();
    await deletePhoto(ctx, str(form, "photoId"));
  });
  if (result.ok) refresh(id);
  return result;
}

// --- Estimation --------------------------------------------------------------

export async function addEstimateLineAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("estimate:write");
    ctx.ip = await getClientIp();
    await addLine(ctx, id, formToObject(form) as EstimateLineInput);
  });
  if (result.ok) refresh(id);
  return result;
}

export async function removeEstimateLineAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("estimate:write");
    ctx.ip = await getClientIp();
    await removeLine(ctx, str(form, "lineId"));
  });
  if (result.ok) refresh(id);
  return result;
}

export type SendResult = { url: string; expiresAt: string; emailed: boolean };

export async function sendEstimateAction(_prev: ActionState<SendResult>, form: FormData): Promise<ActionState<SendResult>> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("estimate:send");
    ctx.ip = await getClientIp();
    const sent = await sendEstimate(ctx, id, getAppUrl());
    return { url: sent.url, expiresAt: sent.expiresAt.toISOString(), emailed: sent.emailed };
  });
  if (result.ok) refresh(id);
  return result;
}

export async function regenerateLinkAction(_prev: ActionState<SendResult>, form: FormData): Promise<ActionState<SendResult>> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("estimate:send");
    ctx.ip = await getClientIp();
    const sent = await regenerateLink(ctx, str(form, "estimateId"), getAppUrl());
    return { url: sent.url, expiresAt: sent.expiresAt.toISOString(), emailed: sent.emailed };
  });
  if (result.ok) refresh(id);
  return result;
}

export async function reviseEstimateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("estimate:write");
    ctx.ip = await getClientIp();
    await reviseEstimate(ctx, str(form, "estimateId"));
  });
  if (result.ok) refresh(id);
  return result;
}

export async function setLineDoneAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "workOrderId");
  const result = await runAction(async () => {
    const { ctx } = await requireCtx("repair:transition");
    ctx.ip = await getClientIp();
    await setLineWorkStatus(ctx, str(form, "lineId"), str(form, "done") === "1");
  });
  if (result.ok) refresh(id);
  return result;
}
