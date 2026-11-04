import type { Prisma } from "@prisma/client";
import { DEFAULT_DISCOVERY_ZONES, isZoneKey, type ZoneKey } from "@/lib/growth/zones";
import { LEAD_STAGE_LABELS } from "@/lib/growth/labels";
import { QUALIFY_THRESHOLD, scoreLead, type WebsiteSignals } from "@/lib/growth/scoring";
import { prisma } from "@/server/db";
import { sendMailBestEffort } from "@/server/lib/mailer";
import { getAppUrl } from "@/server/lib/request";
import { audit } from "@/server/services/audit";
import { enrichLeadWebsite, rescoreAll, retentionDue, syncConversions, upsertSireneCandidate } from "./leads";
import { formatRate, growthMetrics } from "./metrics";
import { createDraft } from "./outreach";
import { discoverZone, type FetchLike } from "./sirene";
import { getGrowthSettings, intEnv, isGrowthPaused } from "./settings";
import { isSuppressed } from "./suppression";
import { assertPlatformActor } from "@/server/services/platform";

/**
 * Tâches planifiées de la prospection. Toutes sont :
 * - idempotentes : une exécution réussie par période (semaine ou jour) ;
 * - observables : chaque exécution est enregistrée avec ses compteurs ;
 * - relançables : un échec peut être rejoué jusqu'à 3 fois dans la période ;
 * - bornées : nombre de pages, de sites et de brouillons plafonné par exécution ;
 * - simulables : en mode essai (dryRun), rien n'est écrit ni envoyé ;
 * - internes : aucune ne contacte un prospect. Les envois restent manuels.
 */

export const JOBS = ["discovery", "enrich", "score", "drafts", "weekly-report"] as const;
export type JobName = (typeof JOBS)[number];

export function isJobName(value: string): value is JobName {
  return (JOBS as readonly string[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_RUN_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function periodKey(job: JobName, now: Date): string {
  return job === "discovery" || job === "weekly-report" ? isoWeek(now) : now.toISOString().slice(0, 10);
}

export type JobContext = { dryRun: boolean; now: Date; fetchImpl?: FetchLike; actorId?: string | null };
type Stats = Record<string, Prisma.InputJsonValue>;

function discoveryZones(): ZoneKey[] {
  const raw = (process.env.GROWTH_DISCOVERY_ZONES ?? "").split(",").map((z) => z.trim()).filter(Boolean);
  const zones = raw.filter(isZoneKey);
  return zones.length ? zones : [...DEFAULT_DISCOVERY_ZONES];
}

async function discovery(ctx: JobContext): Promise<Stats> {
  const maxPages = intEnv("GROWTH_DISCOVERY_MAX_PAGES", 4, 1, 20);
  const stats: Stats = { requests: 0 };
  const perZone: Record<string, Prisma.InputJsonValue> = {};
  for (const zone of discoveryZones()) {
    const found = await discoverZone(zone, { maxPages, fetchImpl: ctx.fetchImpl });
    const counts = { found: found.candidates.length, skipped: found.skipped, created: 0, updated: 0, unchanged: 0, suppressed: 0 };
    for (const c of found.candidates) counts[await upsertSireneCandidate(c, { dryRun: ctx.dryRun })]++;
    perZone[zone] = {
      ...counts,
      pages: found.pages,
      totalResults: found.totalResults,
      skipReasons: found.reasons,
      // Un champ attendu qui manque = l'API a changé de format : à vérifier avant d'exécuter pour de vrai.
      missingFields: found.missingFields,
      // En simulation, un échantillon permet de vérifier la lecture à la main (données publiques SIRENE).
      sample: ctx.dryRun ? found.candidates.slice(0, 3).map((c) => ({ name: c.name, siret: c.siret, postalCode: c.postalCode, workforceRange: c.workforceRange, sourceUrl: c.sourceUrl })) : [],
    };
    stats.requests = (stats.requests as number) + found.requests.length;
  }
  stats.zones = perZone;
  return stats;
}

async function enrich(ctx: JobContext): Promise<Stats> {
  const limit = intEnv("GROWTH_WEBSITE_CHECKS_PER_RUN", 15, 1, 100);
  const leads = await prisma.lead.findMany({
    where: {
      website: { not: "" },
      stage: { notIn: ["DO_NOT_CONTACT", "NOT_INTERESTED", "CONVERTED"] },
      OR: [{ websiteCheckedAt: null }, { websiteCheckedAt: { lt: new Date(ctx.now.getTime() - 30 * DAY_MS) } }],
    },
    orderBy: { score: "desc" },
    take: limit,
    select: { id: true },
  });
  if (ctx.dryRun) return { eligible: leads.length };
  let reachable = 0;
  for (const { id } of leads) {
    await enrichLeadWebsite(id, { fetchImpl: ctx.fetchImpl });
    const lead = await prisma.lead.findUnique({ where: { id }, select: { websiteSignals: true } });
    if ((lead?.websiteSignals as WebsiteSignals | null)?.reachable) reachable++;
  }
  return { checked: leads.length, reachable };
}

async function score(ctx: JobContext): Promise<Stats> {
  if (ctx.dryRun) {
    const leads = await prisma.lead.findMany({ where: { stage: "DISCOVERED" } });
    const wouldQualify = leads.filter((l) => {
      const r = scoreLead({ ...l, websiteSignals: l.websiteSignals as WebsiteSignals | null });
      return !r.disqualified && r.score >= QUALIFY_THRESHOLD;
    }).length;
    return { discovered: leads.length, wouldQualify };
  }
  const scored = await rescoreAll();
  const synced = await syncConversions();
  return { ...scored, ...synced };
}

async function drafts(ctx: JobContext): Promise<Stats> {
  const limit = intEnv("GROWTH_DRAFTS_PER_RUN", 10, 1, 50);
  const useAi = (await getGrowthSettings()).aiEnabled;
  const firsts = await prisma.lead.findMany({
    where: { stage: "QUALIFIED", email: { not: "" }, optedOutAt: null, drafts: { none: { status: { in: ["DRAFT", "APPROVED", "SENT"] } } } },
    orderBy: [{ demoRequestedAt: { sort: "desc", nulls: "last" } }, { score: "desc" }],
    take: limit,
  });
  const followUps = await prisma.lead.findMany({
    where: {
      stage: "CONTACTED",
      nextFollowUpAt: { lte: ctx.now },
      optedOutAt: null,
      drafts: { none: { OR: [{ status: { in: ["DRAFT", "APPROVED"] } }, { kind: "FOLLOW_UP" }] } },
    },
    take: limit,
  });
  // Un garage qui a demandé une démo reçoit une proposition de créneau, pas une présentation.
  const eligible = [...firsts.map((l) => ({ lead: l, kind: l.demoRequestedAt ? ("DEMO_INVITE" as const) : ("FIRST_CONTACT" as const) })), ...followUps.map((l) => ({ lead: l, kind: "FOLLOW_UP" as const }))].slice(0, limit);
  if (ctx.dryRun) return { firstContacts: firsts.length, followUps: followUps.length, wouldPrepare: eligible.length, ai: useAi };
  let prepared = 0;
  let skipped = 0;
  for (const { lead, kind } of eligible) {
    if (await isSuppressed({ email: lead.email, siret: lead.siret })) {
      skipped++;
      continue;
    }
    try {
      await createDraft(lead.id, kind, { useAi });
      prepared++;
    } catch {
      skipped++;
    }
  }
  return { prepared, skipped, ai: useAi };
}

export async function weeklyReportText(now = new Date()): Promise<string> {
  const m = await growthMetrics(now);
  const due = await prisma.lead.findMany({ where: { nextFollowUpAt: { lte: now } }, select: { id: true, name: true }, take: 20 });
  const toErase = await retentionDue(now);
  const lines = [
    `Rapport GarageFlow, semaine ${isoWeek(now)}`,
    "",
    "Produit",
    `- Inscriptions (30 j) : ${m.product.signups30} ; total : ${m.product.signupsAll}`,
    `- Garages actifs (au moins un dossier) : ${formatRate(m.product.activation)}`,
    `- Essai vers payant : ${formatRate(m.product.trialToPaid)}`,
    `- Abonnés actifs : ${m.product.active} ; revenu mensuel HT : ${m.product.mrrHt} €`,
    `- Résiliations : ${formatRate(m.product.churn)}`,
    "",
    "Audience (30 j)",
    `- Pages vues : ${m.traffic.views30}`,
    ...m.traffic.bySource.slice(0, 5).map((s) => `  ${s.source} : ${s.count}`),
    "",
    "Prospection",
    ...Object.entries(m.sales.stageCounts).filter(([, n]) => n > 0).map(([s, n]) => `- ${LEAD_STAGE_LABELS[s as keyof typeof LEAD_STAGE_LABELS]} : ${n}`),
    `- Messages envoyés (30 j) : ${m.sales.sent30} ; taux de réponse : ${formatRate(m.sales.replyRate)}`,
    `- Demandes de démo (30 j) : ${m.sales.demoRequests30}`,
    `- Brouillons à relire : ${m.sales.pendingReview}`,
    `- Dépense rédaction assistée ce mois : ${m.aiSpendUsd.toFixed(2)} $`,
    `- Prospects à effacer (plus de 3 ans sans échange) : ${toErase}`,
    "",
    due.length ? "Relances à faire" : "Aucune relance en retard.",
    ...due.map((d) => `- ${d.name} : ${getAppUrl()}/admin/prospects/${d.id}`),
    "",
    `Console : ${getAppUrl()}/admin/croissance`,
  ];
  return lines.join("\n");
}

async function weeklyReport(ctx: JobContext): Promise<Stats> {
  const text = await weeklyReportText(ctx.now);
  const to = process.env.GROWTH_REPORT_TO;
  if (ctx.dryRun || !to) return { sent: false, reason: to ? "essai" : "GROWTH_REPORT_TO absent", preview: text.slice(0, 4000) };
  const sent = await sendMailBestEffort({ to, subject: `GarageFlow : rapport ${isoWeek(ctx.now)}`, text });
  return { sent };
}

const HANDLERS: Record<JobName, (ctx: JobContext) => Promise<Stats>> = {
  discovery,
  enrich,
  score,
  drafts,
  "weekly-report": weeklyReport,
};

export type RunOptions = { dryRun?: boolean; trigger: string; force?: boolean; now?: Date; fetchImpl?: FetchLike; actorId?: string | null };

export async function runJob(job: JobName, opts: RunOptions) {
  if (opts.actorId != null) await assertPlatformActor(opts.actorId);
  const now = opts.now ?? new Date();
  const dryRun = Boolean(opts.dryRun);
  if (await isGrowthPaused()) {
    return prisma.growthJobRun.create({
      data: { job, idempotencyKey: `${job}:paused:${now.getTime()}:${Math.random().toString(36).slice(2, 8)}`, dryRun, status: "SKIPPED", trigger: opts.trigger, error: "arrêt d'urgence actif", finishedAt: now },
    });
  }

  const period = periodKey(job, now);
  // Les essais et les relances forcées ne réservent pas la période.
  const key = dryRun || opts.force ? `${job}:${period}:${dryRun ? "dry" : "manual"}:${now.getTime()}` : `${job}:${period}`;
  let run = await prisma.growthJobRun.findUnique({ where: { idempotencyKey: key } });
  if (run) {
    const stale = run.status === "RUNNING" && now.getTime() - run.startedAt.getTime() > STALE_RUN_MS;
    if (run.status === "SUCCEEDED" || run.status === "SKIPPED") return run;
    if (run.status === "RUNNING" && !stale) return run;
    if (run.attempts >= MAX_ATTEMPTS) return run;
    run = await prisma.growthJobRun.update({ where: { id: run.id }, data: { status: "RUNNING", attempts: { increment: 1 }, error: "", startedAt: now, finishedAt: null } });
  } else {
    try {
      run = await prisma.growthJobRun.create({ data: { job, idempotencyKey: key, dryRun, trigger: opts.trigger, startedAt: now } });
    } catch {
      // Exécution concurrente qui a pris la même période : on la laisse faire.
      return prisma.growthJobRun.findUniqueOrThrow({ where: { idempotencyKey: key } });
    }
  }

  try {
    const stats = await HANDLERS[job]({ dryRun, now, fetchImpl: opts.fetchImpl, actorId: opts.actorId });
    const done = await prisma.growthJobRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", stats, finishedAt: new Date() } });
    await audit({ userId: opts.actorId ?? null, action: `growth.job.${job}`, entityType: "GrowthJobRun", entityId: run.id, metadata: { dryRun, trigger: opts.trigger } });
    return done;
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : "erreur inconnue";
    console.error(`[growth] tâche ${job} en échec`, e);
    return prisma.growthJobRun.update({ where: { id: run.id }, data: { status: "FAILED", error: message, finishedAt: new Date() } });
  }
}

export async function listJobRuns(actorId: string, take = 30) {
  await assertPlatformActor(actorId);
  return prisma.growthJobRun.findMany({ orderBy: { startedAt: "desc" }, take });
}

