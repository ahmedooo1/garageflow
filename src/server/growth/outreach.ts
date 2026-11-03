import type { DraftKind, Lead } from "@prisma/client";
import { CLOSED_STAGES, DRAFT_KIND_LABELS, workforceLabel } from "@/lib/growth/labels";
import type { WebsiteSignals } from "@/lib/growth/scoring";
import { zoneLabel } from "@/lib/growth/zones";
import { TRIAL_DAYS } from "@/lib/plans";
import { prisma } from "@/server/db";
import { hmacSign, safeEqual } from "@/server/lib/crypto";
import { AppError, NotFoundError } from "@/server/lib/errors";
import { mailFrom, sendMail } from "@/server/lib/mailer";
import { getAppUrl } from "@/server/lib/request";
import { audit } from "@/server/services/audit";
import { generateAiDraft, type DraftFacts } from "./ai";
import { logActivity } from "./leads";
import { addSuppression, isSuppressed } from "./suppression";
import { getSenderIdentity, intEnv, isGrowthPaused, outreachConfigProblems, smtpOutreachProblems } from "./settings";

/**
 * Messages de prospection : préparés automatiquement ou à la demande, jamais
 * envoyés sans qu'un administrateur ait relu et approuvé le texte exact.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const FOLLOW_UP_AFTER_DAYS = 7;
export const TRIAL_LINK_PLACEHOLDER = "{{LIEN_ESSAI}}";

// ---------------------------------------------------------------------------
// Désinscription
// ---------------------------------------------------------------------------

export function unsubscribeToken(leadId: string): string {
  return `${leadId}.${hmacSign(`unsubscribe:${leadId}`).slice(0, 32)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [leadId, sig] = token.split(".");
  if (!leadId || !sig || !/^[a-z0-9]{10,40}$/.test(leadId)) return null;
  return safeEqual(hmacSign(`unsubscribe:${leadId}`).slice(0, 32), sig) ? leadId : null;
}

export function unsubscribeUrl(leadId: string): string {
  return `${getAppUrl()}/desinscription/${unsubscribeToken(leadId)}`;
}

/** Opposition exercée via le lien : définitive et idempotente. */
export async function processUnsubscribe(token: string): Promise<boolean> {
  const leadId = verifyUnsubscribeToken(token);
  if (!leadId) return false;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return true; // Prospect déjà effacé : rien à faire, réponse identique.
  if (lead.stage === "DO_NOT_CONTACT" && lead.optedOutAt) return true;
  await prisma.$transaction(async (tx) => {
    // Toutes les adresses réellement écrites, pas seulement l'adresse actuelle de la fiche.
    const sent = await tx.outreachDraft.findMany({ where: { leadId, status: "SENT" }, select: { toEmail: true } });
    const emails = new Set([lead.email, ...sent.map((d) => d.toEmail)].filter(Boolean));
    for (const email of emails) await addSuppression("EMAIL", email, { reason: "Lien de désinscription", origin: "unsubscribe_link" }, tx);
    if (lead.siret) await addSuppression("SIRET", lead.siret, { reason: "Lien de désinscription", origin: "unsubscribe_link" }, tx);
    await tx.lead.update({ where: { id: leadId }, data: { stage: "DO_NOT_CONTACT", optedOutAt: new Date(), nextFollowUpAt: null } });
    await tx.outreachDraft.updateMany({ where: { leadId, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "DISCARDED" } });
    await logActivity(leadId, "opt_out", "Opposition via le lien de désinscription", {}, tx);
  });
  await audit({ action: "growth.unsubscribed", entityType: "Lead", entityId: leadId });
  return true;
}

// ---------------------------------------------------------------------------
// Rédaction
// ---------------------------------------------------------------------------

export function trialLink(kind: DraftKind): string {
  return `${getAppUrl()}/register?utm_source=prospection&utm_medium=email&utm_campaign=${kind.toLowerCase()}`;
}

function provenance(lead: Lead): string {
  if (lead.source === "INBOUND_DEMO") return "Vous nous avez écrit via le formulaire de démonstration de GarageFlow.";
  const registry = lead.source === "SIRENE" ? "la base SIRENE de l'INSEE (données publiques)" : lead.sourceUrl;
  const email = lead.emailSourceUrl && lead.emailSourceUrl !== lead.sourceUrl ? ` Votre adresse professionnelle figure sur : ${lead.emailSourceUrl}.` : "";
  return `Vous recevez ce message car ${lead.name} est référencé comme garage de réparation automobile dans ${registry}.${email}`;
}

/** Pied de message ajouté par le code, identique quel que soit le rédacteur. */
export function legalFooter(lead: Lead): string {
  const id = getSenderIdentity();
  return [
    "--",
    [id.name, id.company].filter(Boolean).join(", ") || "[Identité de l'expéditeur à compléter]",
    [id.address || "[Adresse postale à compléter]", id.siren ? `SIREN ${id.siren}` : ""].filter(Boolean).join(" · "),
    "",
    provenance(lead),
    `Pour ne plus recevoir de message de notre part : ${unsubscribeUrl(lead.id)}`,
    `Vos données et vos droits : ${getAppUrl()}/confidentialite#prospection`,
  ].join("\n");
}

function greeting(lead: Lead): string {
  return lead.contactName ? `Bonjour ${lead.contactName},` : "Bonjour,";
}

/** Modèles déterministes, toujours disponibles, sans aucun appel externe. */
export function templateDraft(lead: Lead, kind: DraftKind, previousSubject: string | null): { subject: string; body: string } {
  const sender = getSenderIdentity().name || "[Prénom]";
  const firstName = sender.split(/\s+/)[0];
  const where = lead.city ? ` à ${lead.city}` : "";
  if (kind === "FOLLOW_UP") {
    return {
      subject: previousSubject ? `Re: ${previousSubject}` : `GarageFlow, suite à mon message`,
      body: [
        greeting(lead),
        "",
        "Je me permets une seule relance au sujet de mon message précédent. Si la question de l'accord client sur les travaux ne se pose pas chez vous, dites-le-moi simplement et je ne vous écrirai plus.",
        "",
        `Sinon, l'essai est gratuit pendant ${TRIAL_DAYS} jours, sans carte bancaire : ${TRIAL_LINK_PLACEHOLDER}`,
        "",
        "Bonne journée,",
        firstName,
      ].join("\n"),
    };
  }
  if (kind === "DEMO_INVITE") {
    const asked = Boolean(lead.demoRequestedAt);
    return {
      subject: asked ? `Votre démonstration de GarageFlow` : `Une démonstration de GarageFlow pour ${lead.name} ?`,
      body: [
        greeting(lead),
        "",
        asked
          ? `Merci pour votre demande. Je vous propose une démonstration de 20 minutes${where}, à l'atelier ou en visio, au moment qui vous arrange.`
          : `Je vous propose une démonstration de 20 minutes de GarageFlow${where}, à l'atelier ou en visio, au moment qui vous arrange.`,
        "",
        "Je vous montrerai un dossier complet sur un vrai cas : réception avec photos, diagnostic, envoi du lien au client, accord ligne par ligne, puis restitution.",
        "",
        "Quel créneau vous conviendrait cette semaine ou la suivante ?",
        "",
        "Bonne journée,",
        firstName,
      ].join("\n"),
    };
  }
  return {
    subject: `${lead.name} : l'accord du client sur les travaux, par écrit`,
    body: [
      greeting(lead),
      "",
      `Je m'appelle ${sender} et je développe GarageFlow, un logiciel d'atelier pour les garages indépendants${lead.zone ? ` de la région (${zoneLabel(lead.zone)})` : ""}.`,
      "",
      "Dans beaucoup d'ateliers, obtenir l'accord d'un client sur un devis demande plusieurs appels. Avec GarageFlow, le client reçoit un lien avec le diagnostic, les photos et le prix de chaque ligne, et accepte ou refuse ligne par ligne. Son accord est horodaté et reste dans le dossier.",
      "",
      `Est-ce un sujet chez vous ? Je peux vous le montrer en 20 minutes, à l'atelier ou en visio. Vous pouvez aussi l'essayer ${TRIAL_DAYS} jours gratuitement, sans carte bancaire :`,
      TRIAL_LINK_PLACEHOLDER,
      "",
      "Bonne journée,",
      firstName,
    ].join("\n"),
  };
}

function factsFor(lead: Lead, kind: DraftKind, previousSubject: string | null): DraftFacts {
  const ws = lead.websiteSignals as WebsiteSignals | null;
  return {
    kind,
    garageName: lead.name.slice(0, 120),
    city: lead.city.slice(0, 80),
    zone: zoneLabel(lead.zone),
    teamSize: lead.workforceRange && lead.workforceRange !== "NN" ? workforceLabel(lead.workforceRange) : null,
    independent: lead.establishmentsCount === null ? null : lead.establishmentsCount <= 2,
    onlineBooking: ws?.reachable ? ws.onlineBooking : null,
    hasWebsite: Boolean(lead.website),
    hypothesis: lead.hypothesis.slice(0, 600),
    senderFirstName: (getSenderIdentity().name || "").split(/\s+/)[0] ?? "",
    previousSubject,
  };
}

function finalize(lead: Lead, kind: DraftKind, body: string): string {
  // La formule nominative est ajoutée ici : le nom du contact n'est jamais transmis au modèle.
  const text = body.trim().replace(/^Bonjour\s*,/, greeting(lead));
  return `${text.replaceAll(TRIAL_LINK_PLACEHOLDER, trialLink(kind)).trim()}\n\n${legalFooter(lead)}`;
}

async function assertContactable(lead: Lead) {
  if ((CLOSED_STAGES as readonly string[]).includes(lead.stage)) throw new AppError("Ce prospect n'est plus à contacter à cette étape");
  if (lead.optedOutAt || (await isSuppressed({ email: lead.email, siret: lead.siret }))) throw new AppError("Ce garage s'est opposé à la prospection");
}

export type CreateDraftOptions = { useAi?: boolean; actorId?: string | null };

/** Prépare un brouillon. Une seule relance par prospect, et seulement après un premier envoi. */
export async function createDraft(leadId: string, kind: DraftKind, opts: CreateDraftOptions = {}) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Prospect introuvable");
  await assertContactable(lead);
  const open = await prisma.outreachDraft.count({ where: { leadId, status: { in: ["DRAFT", "APPROVED"] } } });
  if (open > 0) throw new AppError("Un brouillon est déjà en attente pour ce prospect");
  const sent = await prisma.outreachDraft.findMany({ where: { leadId, status: "SENT" }, orderBy: { sentAt: "desc" } });
  let previousSubject: string | null = null;
  if (kind === "FOLLOW_UP") {
    if (sent.length === 0) throw new AppError("Aucun message envoyé : rien à relancer");
    if (sent.some((d) => d.kind === "FOLLOW_UP")) throw new AppError("Une relance a déjà été envoyée : pas de seconde relance");
    previousSubject = sent[0].subject;
  }

  let generator = "template";
  let content = templateDraft(lead, kind, previousSubject);
  let aiNote = "";
  if (opts.useAi) {
    const ai = await generateAiDraft(factsFor(lead, kind, previousSubject), lead.id);
    if ("error" in ai) aiNote = ` (rédaction assistée indisponible : ${ai.error})`;
    else {
      content = { subject: ai.subject, body: ai.body };
      generator = `ai:${ai.model}`;
    }
  }

  const draft = await prisma.outreachDraft.create({
    data: { leadId, kind, subject: content.subject.slice(0, 200), body: finalize(lead, kind, content.body), generator, toEmail: lead.email },
  });
  if (lead.stage === "QUALIFIED" || lead.stage === "DISCOVERED") {
    await prisma.lead.update({ where: { id: leadId }, data: { stage: "READY_FOR_REVIEW" } });
  }
  await logActivity(leadId, "draft", `Brouillon préparé : ${DRAFT_KIND_LABELS[kind].toLowerCase()}${aiNote}`, { actorId: opts.actorId ?? null, metadata: { draftId: draft.id, generator } });
  return draft;
}

/** Toute modification annule l'approbation : on approuve le texte exact qui partira. */
export async function updateDraft(draftId: string, input: { subject: string; body: string }, actorId: string) {
  const draft = await prisma.outreachDraft.findUnique({ where: { id: draftId }, include: { lead: true } });
  if (!draft) throw new NotFoundError("Brouillon introuvable");
  if (draft.status !== "DRAFT" && draft.status !== "APPROVED") throw new AppError("Ce message n'est plus modifiable");
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length < 3 || subject.length > 200) throw new AppError("Objet de 3 à 200 caractères");
  if (body.length < 50 || body.length > 5000) throw new AppError("Corps de 50 à 5 000 caractères");
  if (!body.includes(unsubscribeUrl(draft.leadId))) throw new AppError("Le lien de désinscription doit rester dans le message");
  await prisma.outreachDraft.update({ where: { id: draftId }, data: { subject, body, status: "DRAFT", approvedAt: null, approvedById: null } });
  await logActivity(draft.leadId, "draft", "Brouillon modifié", { actorId, metadata: { draftId } });
}

export async function approveDraft(draftId: string, actorId: string) {
  const draft = await prisma.outreachDraft.findUnique({ where: { id: draftId }, include: { lead: true } });
  if (!draft) throw new NotFoundError("Brouillon introuvable");
  if (draft.status !== "DRAFT") throw new AppError("Seul un brouillon peut être approuvé");
  await assertContactable(draft.lead);
  if (!draft.lead.email) throw new AppError("Aucune adresse email sourcée pour ce prospect");
  const problems = outreachConfigProblems();
  if (problems.length) throw new AppError(`Configuration incomplète : ${problems.join(" ; ")}`);
  if (draft.body.includes("[Identité") || draft.body.includes("[Adresse") || draft.body.includes("[Prénom]")) {
    throw new AppError("Le message contient encore un champ à compléter");
  }
  await prisma.outreachDraft.update({ where: { id: draftId }, data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date(), toEmail: draft.lead.email } });
  await logActivity(draft.leadId, "draft", "Message approuvé", { actorId, metadata: { draftId } });
  await audit({ userId: actorId, action: "growth.draft_approved", entityType: "OutreachDraft", entityId: draftId });
}

export async function discardDraft(draftId: string, actorId: string) {
  const draft = await prisma.outreachDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new NotFoundError("Brouillon introuvable");
  if (draft.status === "SENT") throw new AppError("Un message envoyé ne peut pas être abandonné");
  await prisma.outreachDraft.update({ where: { id: draftId }, data: { status: "DISCARDED" } });
  await logActivity(draft.leadId, "draft", "Brouillon abandonné", { actorId, metadata: { draftId } });
}

export function sendingEnabled(): boolean {
  return process.env.OUTREACH_SEND_ENABLED === "true";
}

async function assertSendable(draftId: string) {
  if (await isGrowthPaused()) throw new AppError("Prospection en pause (arrêt d'urgence actif)");
  const draft = await prisma.outreachDraft.findUnique({ where: { id: draftId }, include: { lead: true } });
  if (!draft) throw new NotFoundError("Message introuvable");
  if (draft.status !== "APPROVED" || !draft.approvedAt) throw new AppError("Le message doit d'abord être approuvé");
  await assertContactable(draft.lead);
  if (!draft.toEmail || draft.toEmail !== draft.lead.email) throw new AppError("L'adresse du prospect a changé : approuvez à nouveau");
  const limit = intEnv("OUTREACH_DAILY_LIMIT", 20, 1, 100);
  const sentToday = await prisma.outreachDraft.count({ where: { status: "SENT", sentAt: { gte: new Date(Date.now() - DAY_MS) } } });
  if (sentToday >= limit) throw new AppError(`Limite de ${limit} messages par 24 h atteinte`);
  return draft;
}

async function recordSent(draft: { id: string; leadId: string; kind: DraftKind }, via: "smtp" | "manual", actorId: string) {
  const now = new Date();
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: draft.leadId } });
  const advance = ["DISCOVERED", "QUALIFIED", "READY_FOR_REVIEW"].includes(lead.stage);
  await prisma.lead.update({
    where: { id: draft.leadId },
    data: {
      stage: advance ? "CONTACTED" : undefined,
      lastContactedAt: now,
      // Après la relance, aucun rappel automatique : la suite dépend de la réponse.
      nextFollowUpAt: draft.kind === "FOLLOW_UP" ? null : new Date(now.getTime() + FOLLOW_UP_AFTER_DAYS * DAY_MS),
    },
  });
  await logActivity(draft.leadId, "sent", via === "smtp" ? "Message envoyé depuis GarageFlow" : "Message envoyé depuis la messagerie de l'admin", { actorId, metadata: { draftId: draft.id } });
  await audit({ userId: actorId, action: "growth.draft_sent", entityType: "OutreachDraft", entityId: draft.id, metadata: { via } });
}

/** Envoi SMTP d'un message approuvé, un par un, sur action explicite d'un admin. */
export async function sendApprovedDraft(draftId: string, actorId: string) {
  if (!sendingEnabled()) throw new AppError("Envoi depuis GarageFlow désactivé (OUTREACH_SEND_ENABLED). Envoyez depuis votre messagerie puis marquez le message comme envoyé.");
  const problems = [...outreachConfigProblems(), ...smtpOutreachProblems()];
  if (problems.length) throw new AppError(`Configuration incomplète : ${problems.join(" ; ")}`);
  const draft = await assertSendable(draftId);
  // Verrou optimiste : un double clic n'envoie qu'une fois.
  const claimed = await prisma.outreachDraft.updateMany({ where: { id: draftId, status: "APPROVED" }, data: { status: "SENT", sentAt: new Date(), sentById: actorId, sentVia: "smtp" } });
  if (claimed.count !== 1) throw new AppError("Ce message est déjà en cours d'envoi");
  const id = getSenderIdentity();
  const unsub = unsubscribeUrl(draft.leadId);
  try {
    await sendMail({
      to: draft.toEmail,
      from: id.from || mailFrom(),
      replyTo: id.replyTo || undefined,
      subject: draft.subject,
      text: draft.body,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
  } catch (e) {
    await prisma.outreachDraft.update({ where: { id: draftId }, data: { status: "APPROVED", sentAt: null, sentById: null, sentVia: "" } });
    throw new AppError(`Échec d'envoi : ${e instanceof Error ? e.message.slice(0, 120) : "erreur SMTP"}`);
  }
  await recordSent(draft, "smtp", actorId);
}

/** L'admin a envoyé le texte approuvé depuis sa propre messagerie. */
export async function markDraftSentManually(draftId: string, actorId: string) {
  const draft = await assertSendable(draftId);
  const claimed = await prisma.outreachDraft.updateMany({ where: { id: draftId, status: "APPROVED" }, data: { status: "SENT", sentAt: new Date(), sentById: actorId, sentVia: "manual" } });
  if (claimed.count !== 1) throw new AppError("Ce message est déjà marqué comme envoyé");
  await recordSent(draft, "manual", actorId);
}

export async function listDraftQueue() {
  return prisma.outreachDraft.findMany({
    where: { status: { in: ["DRAFT", "APPROVED"] } },
    orderBy: { createdAt: "asc" },
    include: { lead: { select: { id: true, name: true, city: true, score: true, email: true, stage: true } } },
    take: 200,
  });
}
