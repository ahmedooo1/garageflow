import { z } from "zod";
import { dedupeKey, normalizeEmail, normalizePostalCode } from "@/lib/growth/normalize";
import { zoneForPostalCode } from "@/lib/growth/zones";
import { prisma } from "@/server/db";
import { sendMailBestEffort } from "@/server/lib/mailer";
import { getAppUrl } from "@/server/lib/request";
import { emailField, parseOrThrow, requiredText } from "@/server/lib/validation";
import { findExistingLead, logActivity, rescoreLead } from "./leads";

/**
 * Demande de démonstration depuis le site public. Les informations sont
 * fournies par le garage lui-même, pour être recontacté : rien d'autre.
 */

export const demoRequestSchema = z.object({
  name: requiredText("Votre nom", 120),
  garageName: requiredText("Nom du garage", 160),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Code postal à 5 chiffres"),
  email: emailField,
  phone: z
    .string()
    .trim()
    .max(30)
    .default("")
    .refine((v) => !v || /^(\+33|0)\d{9}$/.test(v.replace(/[^\d+]/g, "")), "Téléphone invalide"),
  message: z.string().trim().max(1000).default(""),
});

export type DemoRequestInput = z.input<typeof demoRequestSchema>;

export async function submitDemoRequest(input: DemoRequestInput): Promise<{ leadId: string }> {
  const data = parseOrThrow(demoRequestSchema, input);
  const email = normalizeEmail(data.email);
  const postalCode = normalizePostalCode(data.postalCode);
  const phone = data.phone.replace(/[^\d+]/g, "");
  const now = new Date();
  const formUrl = `${getAppUrl()}/#demo`;

  // Même garage déjà connu (même email, ou même nom et code postal) : on complète la fiche.
  const existing = await findExistingLead({ name: data.garageName, postalCode, email });

  let leadId: string;
  if (existing) {
    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        email: existing.email || email,
        emailSourceUrl: existing.email ? existing.emailSourceUrl : formUrl,
        phone: existing.phone || phone,
        phoneSourceUrl: existing.phone ? existing.phoneSourceUrl : phone ? formUrl : "",
        contactName: existing.contactName || data.name,
        demoRequestedAt: now,
        demoMessage: data.message,
      },
    });
    leadId = existing.id;
  } else {
    const lead = await prisma.lead.create({
      data: {
        name: data.garageName,
        postalCode,
        zone: zoneForPostalCode(postalCode) ?? "",
        email,
        emailSourceUrl: formUrl,
        phone,
        phoneSourceUrl: phone ? formUrl : "",
        contactName: data.name,
        dedupeKey: dedupeKey({ name: data.garageName, postalCode, email }),
        source: "INBOUND_DEMO",
        sourceUrl: formUrl,
        sourceFetchedAt: now,
        demoRequestedAt: now,
        demoMessage: data.message,
        stage: "QUALIFIED",
      },
    });
    leadId = lead.id;
  }
  await logActivity(leadId, "demo_request", `Demande de démonstration${data.message ? ` : ${data.message.slice(0, 300)}` : ""}`);
  if (existing?.optedOutAt) {
    // La demande est explicite, mais l'opposition antérieure reste enregistrée : la réponse se fait à la main.
    await logActivity(leadId, "note", "Ce garage s'était opposé à la prospection : répondez à sa demande depuis votre messagerie, sans réactiver la prospection.");
  }
  await rescoreLead(leadId);

  // Notification interne uniquement (aucun message n'est envoyé au demandeur).
  const to = process.env.GROWTH_REPORT_TO;
  if (to) {
    await sendMailBestEffort({
      to,
      subject: `Demande de démo : ${data.garageName}`,
      text: `${data.name} (${data.garageName}, ${postalCode}) demande une démonstration.\nEmail : ${email}${phone ? `\nTéléphone : ${phone}` : ""}\n\n${data.message}\n\nFiche : ${getAppUrl()}/admin/prospects/${leadId}`,
    });
  }
  return { leadId };
}
