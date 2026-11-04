import { prisma } from "@/server/db";
import { audit } from "@/server/services/audit";
import { assertPlatformActor } from "@/server/services/platform";

export type GrowthConfig = {
  paused: boolean;
  aiEnabled: boolean;
  aiMonthlyBudgetUsd: number;
};

export async function getGrowthSettings(): Promise<GrowthConfig> {
  const row = await prisma.growthSettings.findUnique({ where: { id: "global" } });
  return { paused: row?.paused ?? false, aiEnabled: row?.aiEnabled ?? false, aiMonthlyBudgetUsd: row?.aiMonthlyBudgetUsd ?? 10 };
}

/** Arrêt d'urgence : réglage en base (console) ou variable d'environnement (serveur). */
export async function isGrowthPaused(): Promise<boolean> {
  if (process.env.GROWTH_KILL_SWITCH === "1") return true;
  return (await getGrowthSettings()).paused;
}

export async function updateGrowthSettings(patch: Partial<GrowthConfig>, actorId: string): Promise<GrowthConfig> {
  await assertPlatformActor(actorId);
  const data: Partial<GrowthConfig> = {};
  if (patch.paused !== undefined) data.paused = patch.paused;
  if (patch.aiEnabled !== undefined) data.aiEnabled = patch.aiEnabled;
  if (patch.aiMonthlyBudgetUsd !== undefined) {
    const v = Math.round(patch.aiMonthlyBudgetUsd);
    data.aiMonthlyBudgetUsd = Number.isFinite(v) ? Math.min(Math.max(v, 0), 200) : 10;
  }
  await prisma.growthSettings.upsert({ where: { id: "global" }, create: { id: "global", ...data, updatedById: actorId }, update: { ...data, updatedById: actorId } });
  await audit({ userId: actorId, action: "growth.settings_updated", entityType: "GrowthSettings", entityId: "global", metadata: data });
  return getGrowthSettings();
}

/** Identité de l'expéditeur : obligatoire avant tout envoi (LCEN art. 20, RGPD art. 14). */
export type SenderIdentity = { name: string; company: string; address: string; siren: string; from: string; replyTo: string };

export function getSenderIdentity(): SenderIdentity {
  return {
    name: (process.env.OUTREACH_SENDER_NAME ?? "").trim(),
    company: (process.env.OUTREACH_SENDER_COMPANY ?? "").trim(),
    address: (process.env.OUTREACH_SENDER_ADDRESS ?? "").trim(),
    siren: (process.env.OUTREACH_SENDER_SIREN ?? "").replace(/\s/g, ""),
    from: (process.env.OUTREACH_FROM ?? "").trim(),
    replyTo: (process.env.OUTREACH_REPLY_TO ?? "").trim(),
  };
}

export function missingSenderFields(id = getSenderIdentity()): string[] {
  const missing: string[] = [];
  if (!id.name) missing.push("OUTREACH_SENDER_NAME");
  if (!id.company) missing.push("OUTREACH_SENDER_COMPANY");
  if (!id.address) missing.push("OUTREACH_SENDER_ADDRESS");
  return missing;
}

/**
 * Conditions à réunir avant d'approuver un message : identité de l'expéditeur
 * et liens publics valides (sinon le lien de désinscription ne fonctionnerait pas).
 */
export function outreachConfigProblems(): string[] {
  const problems = missingSenderFields().map((v) => `${v} manquant`);
  const appUrl = (process.env.APP_URL ?? "").trim();
  if (process.env.NODE_ENV === "production" && !/^https:\/\/[^/]+\.[^/]+/.test(appUrl)) {
    problems.push("APP_URL doit être l'adresse publique en https (liens de désinscription)");
  }
  const siren = (process.env.OUTREACH_SENDER_SIREN ?? "").replace(/\s/g, "");
  if (siren && !/^\d{9}$/.test(siren)) problems.push("OUTREACH_SENDER_SIREN doit compter 9 chiffres");
  return problems;
}

/** Envoi depuis GarageFlow : expéditeur nominatif et adresse de réponse lue. */
export function smtpOutreachProblems(): string[] {
  const problems: string[] = [];
  if (process.env.MAIL_TRANSPORT !== "smtp" && process.env.MAIL_TRANSPORT !== "silent") problems.push("MAIL_TRANSPORT doit valoir smtp");
  const id = getSenderIdentity();
  const from = id.from || process.env.MAIL_FROM || "";
  if (!from || /no-?reply|exemple\.fr|\.local\b/i.test(from)) problems.push("OUTREACH_FROM doit être une adresse réelle qui accepte les réponses");
  if (!id.replyTo && !id.from) problems.push("OUTREACH_REPLY_TO ou OUTREACH_FROM requis pour recevoir les réponses");
  return problems;
}

export function intEnv(name: string, fallback: number, min: number, max: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min ? Math.min(v, max) : fallback;
}
