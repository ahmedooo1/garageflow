import { Prisma, type LeadStage } from "@prisma/client";
import { z } from "zod";
import { CLOSED_STAGES, LEAD_STAGE_LABELS, LEAD_STAGES } from "@/lib/growth/labels";
import { dedupeKey, emailDomain, isWebmailDomain, normalizeEmail, normalizeName, normalizePostalCode, normalizeSiret, normalizeUrl, urlHost } from "@/lib/growth/normalize";
import { QUALIFY_THRESHOLD, scoreLead, type ScoreResult, type WebsiteSignals } from "@/lib/growth/scoring";
import { isZoneKey, zoneForPostalCode } from "@/lib/growth/zones";
import { prisma, type Tx } from "@/server/db";
import { AppError, NotFoundError } from "@/server/lib/errors";
import { parseOrThrow } from "@/server/lib/validation";
import { audit } from "@/server/services/audit";
import type { CsvLead } from "./csv";
import type { LeadCandidate } from "./sirene";
import { addSuppression, isSuppressed } from "./suppression";
import { checkWebsite, type CheckOptions } from "./website";
import { assertPlatformActor } from "@/server/services/platform";

type Db = Tx | typeof prisma;

export async function logActivity(
  leadId: string,
  type: string,
  message: string,
  meta: { actorId?: string | null; metadata?: Prisma.InputJsonValue } = {},
  tx: Db = prisma,
): Promise<void> {
  await tx.leadActivity.create({ data: { leadId, type, message: message.slice(0, 2000), actorId: meta.actorId ?? null, metadata: meta.metadata } });
}

// ---------------------------------------------------------------------------
// Découverte et import
// ---------------------------------------------------------------------------

/**
 * Retrouve un garage déjà connu, quelle que soit la source qui l'a apporté :
 * même SIRET, même clé, même email, ou même nom normalisé dans le même code
 * postal. Évite qu'un garage importé à la main puis trouvé dans SIRENE (ou
 * l'inverse) existe deux fois.
 */
export async function findExistingLead(input: { siret?: string | null; name: string; postalCode?: string; email?: string }, tx: Db = prisma) {
  const siret = normalizeSiret(input.siret ?? "");
  if (siret) {
    const bySiret = await tx.lead.findUnique({ where: { siret } });
    if (bySiret) return bySiret;
  }
  const byKey = await tx.lead.findUnique({ where: { dedupeKey: dedupeKey({ siret, name: input.name, postalCode: input.postalCode, email: input.email }) } });
  if (byKey) return byKey;
  const email = normalizeEmail(input.email ?? "");
  if (email) {
    const byEmail = await tx.lead.findFirst({ where: { email } });
    if (byEmail) return byEmail;
  }
  const postalCode = normalizePostalCode(input.postalCode ?? "");
  const name = normalizeName(input.name);
  if (postalCode && name) {
    const samePostal = await tx.lead.findMany({ where: { postalCode }, take: 500 });
    const match = samePostal.find((l) => normalizeName(l.name) === name && (!siret || !l.siret || l.siret === siret));
    if (match) return match;
  }
  return null;
}

export type UpsertOutcome = "created" | "updated" | "unchanged" | "suppressed";

/**
 * Enregistre un établissement trouvé dans SIRENE. Les champs du registre sont
 * rafraîchis ; les coordonnées saisies ou vérifiées par ailleurs ne sont jamais
 * écrasées. Un SIRET en liste d'opposition n'est pas recréé.
 */
export async function upsertSireneCandidate(c: LeadCandidate, opts: { dryRun?: boolean } = {}): Promise<UpsertOutcome> {
  if (await isSuppressed({ siret: c.siret })) return "suppressed";
  const key = dedupeKey({ siret: c.siret, name: c.name, postalCode: c.postalCode });
  const existing = await findExistingLead({ siret: c.siret, name: c.name, postalCode: c.postalCode });
  if (opts.dryRun) return existing ? "updated" : "created";

  const registry = {
    siren: c.siren,
    name: c.name,
    address: c.address,
    postalCode: c.postalCode,
    city: c.city,
    zone: c.zone,
    nafCode: c.nafCode,
    companyCreatedOn: c.companyCreatedOn,
    workforceRange: c.workforceRange,
    establishmentsCount: c.establishmentsCount,
  };
  if (existing) {
    const changed =
      existing.siret !== c.siret ||
      existing.name !== c.name ||
      existing.workforceRange !== c.workforceRange ||
      existing.establishmentsCount !== c.establishmentsCount ||
      existing.address !== c.address;
    // Un garage d'abord saisi à la main ou importé reçoit son SIRET ; sa source d'origine est conservée.
    const fromRegistry = existing.source === "SIRENE";
    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        ...registry,
        siret: c.siret,
        dedupeKey: key,
        sourceUrl: fromRegistry ? c.sourceUrl : undefined,
        sourceFetchedAt: fromRegistry ? c.sourceFetchedAt : undefined,
      },
    });
    if (!existing.siret) await logActivity(existing.id, "registry", "Rapproché de la base SIRENE", { metadata: { sourceUrl: c.sourceUrl } });
    if (changed) await rescoreLead(existing.id);
    return changed ? "updated" : "unchanged";
  }
  const lead = await prisma.lead.create({ data: { ...registry, sourceUrl: c.sourceUrl, sourceFetchedAt: c.sourceFetchedAt, siret: c.siret, dedupeKey: key, source: "SIRENE" } });
  await logActivity(lead.id, "discovered", "Trouvé dans la base SIRENE (établissement actif, code NAF 45.20A)", { metadata: { sourceUrl: c.sourceUrl } });
  await rescoreLead(lead.id);
  return "created";
}

export async function importCsvLeads(rows: CsvLead[], actorId: string): Promise<{ created: number; updated: number; suppressed: number }> {
  const result = { created: 0, updated: 0, suppressed: 0 };
  const now = new Date();
  for (const row of rows) {
  await assertPlatformActor(actorId);
    if (await isSuppressed({ email: row.email, siret: row.siret })) {
      result.suppressed++;
      continue;
    }
    const key = dedupeKey({ siret: row.siret, name: row.name, postalCode: row.postalCode, email: row.email });
    const existing = await findExistingLead({ siret: row.siret, name: row.name, postalCode: row.postalCode, email: row.email });
    if (existing) {
      // On complète, on n'efface pas : seuls les champs vides reçoivent la valeur importée.
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          website: existing.website || row.website,
          email: existing.email || row.email,
          emailSourceUrl: existing.email ? existing.emailSourceUrl : row.email ? row.sourceUrl : "",
          phone: existing.phone || row.phone,
          phoneSourceUrl: existing.phone ? existing.phoneSourceUrl : row.phone ? row.sourceUrl : "",
        },
      });
      await logActivity(existing.id, "imported", "Complété par un import CSV", { actorId, metadata: { sourceUrl: row.sourceUrl } });
      await rescoreLead(existing.id);
      result.updated++;
      continue;
    }
    const lead = await prisma.lead.create({
      data: {
        siret: row.siret || null,
        name: row.name,
        address: row.address,
        postalCode: row.postalCode,
        city: row.city,
        zone: row.zone,
        website: row.website,
        email: row.email,
        emailSourceUrl: row.email ? row.sourceUrl : "",
        phone: row.phone,
        phoneSourceUrl: row.phone ? row.sourceUrl : "",
        dedupeKey: key,
        source: "CSV_IMPORT",
        sourceUrl: row.sourceUrl,
        sourceFetchedAt: now,
      },
    });
    await logActivity(lead.id, "imported", "Créé par un import CSV", { actorId, metadata: { sourceUrl: row.sourceUrl } });
    await rescoreLead(lead.id);
    result.created++;
  }
  await audit({ userId: actorId, action: "growth.csv_imported", entityType: "Lead", metadata: result });
  return result;
}

export const manualLeadSchema = z.object({
  name: z.string().trim().min(1, "Nom obligatoire").max(160),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Code postal à 5 chiffres"),
  city: z.string().trim().max(80).default(""),
  address: z.string().trim().max(200).default(""),
  siret: z.string().trim().default(""),
  sourceUrl: z.string().trim().min(1, "Source obligatoire : d'où vient cette information ?").max(500),
});

export async function createManualLead(input: z.input<typeof manualLeadSchema>, actorId: string) {
  await assertPlatformActor(actorId);
  const data = parseOrThrow(manualLeadSchema, input);
  const sourceUrl = normalizeUrl(data.sourceUrl);
  if (!sourceUrl) throw new AppError("Source invalide : indiquez l'adresse de la page consultée");
  const siret = normalizeSiret(data.siret);
  if (data.siret && !siret) throw new AppError("SIRET invalide (14 chiffres)");
  if (await isSuppressed({ siret })) throw new AppError("Ce garage s'est opposé à la prospection");
  const key = dedupeKey({ siret, name: data.name, postalCode: data.postalCode });
  if (await findExistingLead({ siret, name: data.name, postalCode: data.postalCode })) throw new AppError("Ce garage est déjà dans la liste");
  const lead = await prisma.lead.create({
    data: {
      siret: siret || null,
      name: data.name,
      address: data.address,
      postalCode: data.postalCode,
      city: data.city,
      zone: zoneForPostalCode(data.postalCode) ?? "",
      dedupeKey: key,
      source: "MANUAL",
      sourceUrl,
      sourceFetchedAt: new Date(),
    },
  });
  await logActivity(lead.id, "created", "Ajouté manuellement", { actorId, metadata: { sourceUrl } });
  await rescoreLead(lead.id);
  return lead;
}

// ---------------------------------------------------------------------------
// Qualification
// ---------------------------------------------------------------------------

function toScoring(lead: Prisma.LeadGetPayload<object>) {
  return {
    name: lead.name,
    nafCode: lead.nafCode,
    zone: lead.zone,
    workforceRange: lead.workforceRange,
    establishmentsCount: lead.establishmentsCount,
    companyCreatedOn: lead.companyCreatedOn,
    source: lead.source,
    sourceUrl: lead.sourceUrl,
    sourceFetchedAt: lead.sourceFetchedAt,
    website: lead.website,
    websiteSignals: (lead.websiteSignals as WebsiteSignals | null) ?? null,
    websiteCheckedAt: lead.websiteCheckedAt,
    email: lead.email,
    emailSourceUrl: lead.emailSourceUrl,
    phone: lead.phone,
    phoneSourceUrl: lead.phoneSourceUrl,
    demoRequestedAt: lead.demoRequestedAt,
  };
}

/** Recalcule le score ; fait passer un prospect découvert en « qualifié » au-delà du seuil. */
export async function rescoreLead(leadId: string, tx: Db = prisma): Promise<ScoreResult> {
  const lead = await tx.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Prospect introuvable");
  const result = scoreLead(toScoring(lead));
  const promote = lead.stage === "DISCOVERED" && !result.disqualified && result.score >= QUALIFY_THRESHOLD;
  await tx.lead.update({
    where: { id: leadId },
    data: {
      score: result.score,
      confidence: result.confidence,
      scoreEvidence: result.evidence as unknown as Prisma.InputJsonValue,
      hypothesis: result.hypothesis,
      scoredAt: new Date(),
      stage: promote ? "QUALIFIED" : undefined,
    },
  });
  if (promote) await logActivity(leadId, "stage", `Qualifié automatiquement (score ${result.score})`, {}, tx);
  return result;
}

export async function rescoreAll(): Promise<{ scored: number; qualified: number }> {
  const before = await prisma.lead.count({ where: { stage: "QUALIFIED" } });
  const ids = await prisma.lead.findMany({ select: { id: true } });
  for (const { id } of ids) await rescoreLead(id);
  const after = await prisma.lead.count({ where: { stage: "QUALIFIED" } });
  return { scored: ids.length, qualified: Math.max(0, after - before) };
}

/** Vérifie le site déclaré, conserve les signaux et, si elles manquent, les coordonnées publiées. */
export async function enrichLeadWebsite(leadId: string, opts: CheckOptions & { actorId?: string } = {}) {
  if (opts.actorId != null) await assertPlatformActor(opts.actorId);
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Prospect introuvable");
  if (!lead.website) throw new AppError("Aucun site web renseigné pour ce garage");
  const { signals, contacts } = await checkWebsite(lead.website, opts);
  const takeEmail = !lead.email && contacts.email && !(await isSuppressed({ email: contacts.email }));
  const takePhone = !lead.phone && contacts.phone;
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      websiteSignals: signals as unknown as Prisma.InputJsonValue,
      websiteCheckedAt: new Date(),
      email: takeEmail ? contacts.email : undefined,
      emailSourceUrl: takeEmail ? signals.checkedUrl : undefined,
      phone: takePhone ? contacts.phone : undefined,
      phoneSourceUrl: takePhone ? signals.checkedUrl : undefined,
    },
  });
  await logActivity(
    leadId,
    "website",
    signals.reachable ? `Site vérifié${takeEmail ? ", email publié relevé" : ""}${takePhone ? ", téléphone publié relevé" : ""}` : `Site injoignable : ${signals.error ?? ""}`,
    { actorId: opts.actorId, metadata: { checkedUrl: signals.checkedUrl } },
  );
  return rescoreLead(leadId);
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export type LeadFilters = { q?: string; stage?: string; zone?: string; minScore?: number; hasEmail?: boolean; demo?: boolean; due?: boolean; take?: number };

export async function listLeads(actorId: string, f: LeadFilters = {}) {
  await assertPlatformActor(actorId);
  const where: Prisma.LeadWhereInput = {};
  if (f.stage && (LEAD_STAGES as readonly string[]).includes(f.stage)) where.stage = f.stage as LeadStage;
  if (f.zone && isZoneKey(f.zone)) where.zone = f.zone;
  if (f.minScore) where.score = { gte: f.minScore };
  if (f.hasEmail) where.email = { not: "" };
  if (f.demo) where.demoRequestedAt = { not: null };
  if (f.due) where.nextFollowUpAt = { lte: new Date() };
  const q = f.q?.trim();
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { siret: { contains: q } }, { email: { contains: q, mode: "insensitive" } }];
  return prisma.lead.findMany({
    where,
    orderBy: [{ demoRequestedAt: { sort: "desc", nulls: "last" } }, { score: "desc" }, { updatedAt: "desc" }],
    take: Math.min(f.take ?? 200, 1000),
    include: { _count: { select: { drafts: { where: { status: { in: ["DRAFT", "APPROVED"] } } } } } },
  });
}

export async function getLead(actorId: string, id: string) {
  await assertPlatformActor(actorId);
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      drafts: { orderBy: { createdAt: "desc" } },
      garage: { select: { id: true, name: true, subscriptionStatus: true, createdAt: true } },
    },
  });
  if (!lead) throw new NotFoundError("Prospect introuvable");
  return lead;
}

export const contactSchema = z.object({
  website: z.string().trim().max(300).default(""),
  email: z.string().trim().max(200).default(""),
  emailSourceUrl: z.string().trim().max(500).default(""),
  phone: z.string().trim().max(30).default(""),
  phoneSourceUrl: z.string().trim().max(500).default(""),
  contactName: z.string().trim().max(120).default(""),
});

/** Coordonnées saisies par l'admin : chaque email et téléphone doit citer sa source. */
export async function updateLeadContact(leadId: string, input: z.input<typeof contactSchema>, actorId: string) {
  await assertPlatformActor(actorId);
  const data = parseOrThrow(contactSchema, input);
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Prospect introuvable");
  const website = data.website ? normalizeUrl(data.website) : "";
  if (data.website && !website) throw new AppError("Site web invalide");
  const email = data.email ? normalizeEmail(data.email) : "";
  if (data.email && !email) throw new AppError("Email invalide");
  const emailSourceUrl = email ? normalizeUrl(data.emailSourceUrl) : "";
  if (email && !emailSourceUrl && lead.source !== "INBOUND_DEMO") throw new AppError("Indiquez la page où cet email est publié");
  if (email && (await isSuppressed({ email }))) throw new AppError("Cette adresse figure dans la liste d'opposition");
  const phone = data.phone.replace(/[^\d+]/g, "");
  if (phone && !/^(\+33|0)\d{9}$/.test(phone)) throw new AppError("Téléphone invalide");
  const phoneSourceUrl = phone ? normalizeUrl(data.phoneSourceUrl) : "";
  if (phone && !phoneSourceUrl && lead.source !== "INBOUND_DEMO") throw new AppError("Indiquez la page où ce numéro est publié");

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      website,
      websiteSignals: website === lead.website ? undefined : Prisma.DbNull,
      websiteCheckedAt: website === lead.website ? undefined : null,
      email,
      emailSourceUrl: email ? emailSourceUrl || lead.emailSourceUrl : "",
      phone,
      phoneSourceUrl: phone ? phoneSourceUrl || lead.phoneSourceUrl : "",
      contactName: data.contactName,
    },
  });
  await logActivity(leadId, "contact", "Coordonnées mises à jour", { actorId });
  return rescoreLead(leadId);
}

export async function setLeadStage(leadId: string, stage: LeadStage, actorId: string, note = "") {
  await assertPlatformActor(actorId);
  if (!(LEAD_STAGES as readonly string[]).includes(stage)) throw new AppError("Étape inconnue");
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Prospect introuvable");
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        stage,
        optedOutAt: stage === "DO_NOT_CONTACT" ? (lead.optedOutAt ?? new Date()) : undefined,
        nextFollowUpAt: (CLOSED_STAGES as readonly string[]).includes(stage) ? null : undefined,
      },
    });
    if (stage === "DO_NOT_CONTACT") {
      // L'opposition doit survivre à une nouvelle découverte du même garage.
      if (lead.email) await addSuppression("EMAIL", lead.email, { reason: note || "Ne pas contacter", origin: "admin" }, tx);
      if (lead.siret) await addSuppression("SIRET", lead.siret, { reason: note || "Ne pas contacter", origin: "admin" }, tx);
      await tx.outreachDraft.updateMany({ where: { leadId, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "DISCARDED" } });
    }
    await logActivity(leadId, "stage", `Étape : ${LEAD_STAGE_LABELS[stage]}${note ? ` (${note.slice(0, 200)})` : ""}`, { actorId }, tx);
  });
  await audit({ userId: actorId, action: "growth.lead_stage", entityType: "Lead", entityId: leadId, metadata: { from: lead.stage, to: stage } });
}

export async function addLeadNote(leadId: string, text: string, actorId: string) {
  await assertPlatformActor(actorId);
  const note = text.trim();
  if (!note) throw new AppError("Note vide");
  if (!(await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } }))) throw new NotFoundError("Prospect introuvable");
  await logActivity(leadId, "note", note.slice(0, 2000), { actorId });
}

export async function setFollowUp(leadId: string, when: Date | null, actorId: string) {
  await assertPlatformActor(actorId);
  if (when && Number.isNaN(when.getTime())) throw new AppError("Date invalide");
  await prisma.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: when } });
  await logActivity(leadId, "follow_up", when ? `Relance prévue le ${when.toISOString().slice(0, 10)}` : "Relance annulée", { actorId });
}

/** Réponse reçue (hors application) : consignée par l'admin, avec une éventuelle objection. */
export async function logReply(leadId: string, input: { summary: string; objection?: string; optOut?: boolean }, actorId: string) {
  await assertPlatformActor(actorId);
  const summary = input.summary.trim();
  if (!summary) throw new AppError("Résumez la réponse reçue");
  await prisma.lead.update({ where: { id: leadId }, data: { objection: (input.objection ?? "").trim().slice(0, 500) || undefined } });
  await logActivity(leadId, "reply", summary.slice(0, 2000), { actorId, metadata: { objection: input.objection ?? "" } });
  if (input.optOut) await setLeadStage(leadId, "DO_NOT_CONTACT", actorId, "Opposition exprimée dans la réponse");
  else await setLeadStage(leadId, "REPLIED", actorId);
}

// ---------------------------------------------------------------------------
// Inscription et conversion
// ---------------------------------------------------------------------------

/**
 * Rattache une inscription au prospect correspondant : même email, ou même
 * domaine professionnel que le site du garage. Sans effet sinon.
 */
export async function linkSignupToLead(garageId: string, email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const domain = emailDomain(normalized);
  let lead = await prisma.lead.findFirst({ where: { email: normalized, garageId: null } });
  if (!lead && domain && !isWebmailDomain(domain)) {
    const candidates = await prisma.lead.findMany({ where: { garageId: null, website: { contains: domain } }, take: 5 });
    lead = candidates.find((l) => urlHost(l.website) === domain) ?? null;
  }
  if (!lead) return null;
  await prisma.lead.update({ where: { id: lead.id }, data: { garageId, stage: lead.stage === "DO_NOT_CONTACT" ? undefined : "TRIAL", nextFollowUpAt: null } });
  await logActivity(lead.id, "signup", "Inscription à l'essai gratuit", { metadata: { garageId } });
  return lead.id;
}

/**
 * Les prospects inscrits suivent l'état réel de leur abonnement : « en essai »,
 * puis « client » dès qu'un abonnement payant est actif. Un client qui résilie
 * reste « client » ici (la résiliation est comptée dans les indicateurs) : on
 * ne le fait jamais repasser « en essai ».
 */
export async function syncConversions(): Promise<{ converted: number }> {
  const linked = await prisma.lead.findMany({
    where: { garageId: { not: null }, stage: "TRIAL" },
    select: { id: true, garage: { select: { subscriptionStatus: true } } },
  });
  let converted = 0;
  for (const l of linked) {
    if (l.garage?.subscriptionStatus === "ACTIVE" || l.garage?.subscriptionStatus === "PAST_DUE") {
      await prisma.lead.update({ where: { id: l.id }, data: { stage: "CONVERTED" } });
      await logActivity(l.id, "stage", "Abonnement payant actif");
      converted++;
    }
  }
  return { converted };
}

/**
 * Effacement d'un prospect (droit à l'effacement, RGPD art. 17, ou fin de la
 * durée de conservation). La fiche, son historique et ses brouillons sont
 * supprimés ; seuls l'email et le SIRET rejoignent la liste d'opposition, pour
 * que le garage ne soit pas collecté à nouveau.
 */
export async function eraseLead(leadId: string, actorId: string, reason = "Effacement demandé") {
  await assertPlatformActor(actorId);
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Prospect introuvable");
  await prisma.$transaction(async (tx) => {
    const sent = await tx.outreachDraft.findMany({ where: { leadId }, select: { toEmail: true } });
    for (const email of new Set([lead.email, ...sent.map((d) => d.toEmail)].filter(Boolean))) {
      await addSuppression("EMAIL", email, { reason, origin: "erasure" }, tx);
    }
    if (lead.siret) await addSuppression("SIRET", lead.siret, { reason, origin: "erasure" }, tx);
    await tx.aiUsage.updateMany({ where: { leadId }, data: { leadId: null } });
    await tx.lead.delete({ where: { id: leadId } });
  });
  // Journal sans donnée personnelle : seul l'identifiant technique est conservé.
  await audit({ userId: actorId, action: "growth.lead_erased", entityType: "Lead", entityId: leadId });
}

/** Prospects sans échange depuis plus de 3 ans : à effacer (durée annoncée dans la politique de confidentialité). */
export async function retentionDue(now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - 3 * 365.25 * 24 * 60 * 60 * 1000);
  return prisma.lead.count({
    where: {
      stage: { notIn: ["TRIAL", "CONVERTED"] },
      OR: [{ lastContactedAt: { lt: limit } }, { lastContactedAt: null, createdAt: { lt: limit } }],
    },
  });
}
