"use server";

import type { DraftKind, LeadStage, SuppressionKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdminAction } from "@/server/context";
import { AppError } from "@/server/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/lib/rate-limit";
import { getClientIp } from "@/server/lib/request";
import { formToObject } from "@/server/lib/validation";
import { audit } from "@/server/services/audit";
import { parseLeadCsv } from "@/server/growth/csv";
import { submitDemoRequest, type DemoRequestInput } from "@/server/growth/inbound";
import { isJobName, runJob } from "@/server/growth/jobs";
import {
  addLeadNote,
  createManualLead,
  enrichLeadWebsite,
  eraseLead,
  importCsvLeads,
  logReply,
  setFollowUp,
  setLeadStage,
  updateLeadContact,
} from "@/server/growth/leads";
import { approveDraft, createDraft, discardDraft, markDraftSentManually, sendApprovedDraft, updateDraft } from "@/server/growth/outreach";
import { updateGrowthSettings } from "@/server/growth/settings";
import { addSuppression } from "@/server/growth/suppression";
import { runAction, str, type ActionState } from "./helpers";

/** Toutes les actions de prospection sont réservées à l'équipe GarageFlow. */

function refreshLead(leadId: string) {
  revalidatePath(`/admin/prospects/${leadId}`);
  revalidatePath("/admin/prospects");
}

export async function runJobAction(_prev: ActionState<string>, form: FormData): Promise<ActionState<string>> {
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    const job = str(form, "job");
    if (!isJobName(job)) throw new AppError("Tâche inconnue");
    const run = await runJob(job, { dryRun: str(form, "dryRun") === "1", trigger: "console", force: true, actorId: admin.id });
    if (run.status === "FAILED") throw new AppError(`Échec : ${run.error}`);
    if (run.status === "SKIPPED") throw new AppError(run.error || "Tâche ignorée");
    return JSON.stringify(run.stats ?? {});
  });
  revalidatePath("/admin/croissance");
  revalidatePath("/admin/prospects");
  return result;
}

export async function importCsvAction(_prev: ActionState<string>, form: FormData): Promise<ActionState<string>> {
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    const file = form.get("file");
    let text = str(form, "csv");
    if (file instanceof File && file.size > 0) {
      if (file.size > 1_000_000) throw new AppError("Fichier trop volumineux (1 Mo maximum)");
      text = await file.text();
    }
    if (!text.trim()) throw new AppError("Ajoutez un fichier CSV ou collez son contenu");
    const parsed = parseLeadCsv(text);
    if (parsed.rows.length === 0) throw new AppError(parsed.errors.map((e) => `Ligne ${e.line} : ${e.message}`).slice(0, 5).join(" · ") || "Aucune ligne valide");
    const res = await importCsvLeads(parsed.rows, admin.id);
    const errors = parsed.errors.length ? ` ${parsed.errors.length} ligne(s) refusée(s) : ${parsed.errors.slice(0, 3).map((e) => `ligne ${e.line} (${e.message})`).join(", ")}.` : "";
    return `${res.created} créé(s), ${res.updated} complété(s), ${res.suppressed} ignoré(s) car en opposition.${errors}`;
  });
  revalidatePath("/admin/prospects");
  return result;
}

export async function createManualLeadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id = "";
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    const lead = await createManualLead(formToObject(form) as Parameters<typeof createManualLead>[0], admin.id);
    id = lead.id;
  });
  if (result.ok) redirect(`/admin/prospects/${id}`);
  return result;
}

export async function updateContactAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await updateLeadContact(leadId, formToObject(form) as Parameters<typeof updateLeadContact>[1], admin.id);
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function eraseLeadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await eraseLead(str(form, "leadId"), admin.id, str(form, "reason") || "Effacement demandé");
  });
  if (result.ok) {
    revalidatePath("/admin/prospects");
    redirect("/admin/prospects");
  }
  return result;
}

export async function enrichWebsiteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    enforceRateLimit(`growth:website:${admin.id}`, { limit: 30, windowMs: 15 * 60_000 });
    await enrichLeadWebsite(leadId, { actorId: admin.id });
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function setStageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await setLeadStage(leadId, str(form, "stage") as LeadStage, admin.id, str(form, "note"));
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function addNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await addLeadNote(leadId, str(form, "note"), admin.id);
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function setFollowUpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    const raw = str(form, "date");
    await setFollowUp(leadId, raw ? new Date(`${raw}T09:00:00`) : null, admin.id);
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function logReplyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await logReply(leadId, { summary: str(form, "summary"), objection: str(form, "objection"), optOut: str(form, "optOut") === "on" }, admin.id);
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function createDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    const kind = str(form, "kind") as DraftKind;
    if (!["FIRST_CONTACT", "DEMO_INVITE", "FOLLOW_UP"].includes(kind)) throw new AppError("Type de message inconnu");
    await createDraft(leadId, kind, { useAi: str(form, "useAi") === "1", actorId: admin.id });
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function updateDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await updateDraft(str(form, "draftId"), { subject: str(form, "subject"), body: str(form, "body") }, admin.id);
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function approveDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await approveDraft(str(form, "draftId"), admin.id);
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function discardDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await discardDraft(str(form, "draftId"), admin.id);
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function sendDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await sendApprovedDraft(str(form, "draftId"), admin.id);
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function markSentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const leadId = str(form, "leadId");
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await markDraftSentManually(str(form, "draftId"), admin.id);
  });
  if (result.ok) refreshLead(leadId);
  return result;
}

export async function addSuppressionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    const kind = str(form, "kind") as SuppressionKind;
    if (!["EMAIL", "DOMAIN", "SIRET"].includes(kind)) throw new AppError("Type inconnu");
    const ok = await addSuppression(kind, str(form, "value"), { reason: str(form, "reason"), origin: "admin" });
    if (!ok) throw new AppError("Valeur invalide");
    await audit({ userId: admin.id, action: "growth.suppression_added", entityType: "SuppressionEntry", metadata: { kind } });
  });
  revalidatePath("/admin/croissance");
  return result;
}

export async function updateGrowthSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const admin = await requirePlatformAdminAction();
    await updateGrowthSettings(
      { paused: str(form, "paused") === "on", aiEnabled: str(form, "aiEnabled") === "on", aiMonthlyBudgetUsd: Number(str(form, "aiMonthlyBudgetUsd") || 10) },
      admin.id,
    );
  });
  revalidatePath("/admin/croissance");
  return result;
}

/** Formulaire public de demande de démonstration. */
export async function demoRequestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await getClientIp();
  return runAction(async () => {
    // Champ invisible : rempli uniquement par les robots.
    if (str(form, "website")) return;
    enforceRateLimit(`demo:${ip}`, RATE_LIMITS.demoRequest);
    await submitDemoRequest(formToObject(form) as DemoRequestInput);
  });
}
