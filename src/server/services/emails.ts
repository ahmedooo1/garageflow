import { formatDate, formatDateTime } from "@/lib/format";
import { formatEur } from "@/lib/pricing";
import { button, paragraph, sendMail, sendMailBestEffort } from "@/server/lib/mailer";

/** Emails transactionnels de GarageFlow. Un seul endroit pour les formulations. */

export async function sendWelcomeEmail(params: { to: string; firstName: string; garageName: string; trialEndsAt: Date; appUrl: string }): Promise<void> {
  const lines = [
    `Bonjour ${params.firstName},`,
    ``,
    `Votre garage « ${params.garageName} » est prêt sur GarageFlow.`,
    `Votre essai gratuit court jusqu'au ${formatDate(params.trialEndsAt)}, sans carte bancaire.`,
    ``,
    `Commencer : ${params.appUrl}/app/atelier`,
    ``,
    `Trois étapes pour démarrer :`,
    `1. Réceptionnez un véhicule avec ses photos d'état.`,
    `2. Saisissez le diagnostic et proposez les travaux.`,
    `3. Envoyez le lien de validation au client.`,
  ];
  await sendMailBestEffort({
    to: params.to,
    subject: "Bienvenue sur GarageFlow",
    text: lines.join("\n"),
    html:
      paragraph(`Bonjour ${params.firstName},`) +
      paragraph(`Votre garage « ${params.garageName} » est prêt sur GarageFlow. Votre essai gratuit court jusqu'au ${formatDate(params.trialEndsAt)}, sans carte bancaire.`) +
      button(`${params.appUrl}/app/atelier`, "Ouvrir mon atelier") +
      paragraph("Pour démarrer : réceptionnez un véhicule avec ses photos, saisissez le diagnostic, puis envoyez le lien de validation au client."),
  });
}

export async function sendPasswordResetEmail(params: { to: string; url: string }): Promise<void> {
  await sendMail({
    to: params.to,
    subject: "GarageFlow : réinitialisation de votre mot de passe",
    text: `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${params.url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    html:
      paragraph("Vous avez demandé à réinitialiser votre mot de passe GarageFlow.") +
      button(params.url, "Choisir un nouveau mot de passe") +
      paragraph("Ce lien est valable 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message."),
  });
}

export async function sendApprovalEmail(params: {
  to: string;
  customerName: string;
  garageName: string;
  garagePhone: string;
  vehicle: string;
  plate: string;
  totalTtc: string;
  lineCount: number;
  url: string;
  expiresAt: Date;
}): Promise<boolean> {
  const total = formatEur(params.totalTtc);
  const text = [
    `Bonjour ${params.customerName},`,
    ``,
    `${params.garageName} a terminé le diagnostic de votre ${params.vehicle} (${params.plate}).`,
    `${params.lineCount} intervention${params.lineCount > 1 ? "s vous sont proposées" : " vous est proposée"}, pour un total de ${total} TTC.`,
    ``,
    `Vous pouvez accepter ou refuser chaque intervention ici :`,
    params.url,
    ``,
    `Ce lien personnel est valable jusqu'au ${formatDateTime(params.expiresAt)}.`,
    params.garagePhone ? `Une question ? Appelez le garage au ${params.garagePhone}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return sendMailBestEffort({
    to: params.to,
    subject: `${params.garageName} : validation des travaux sur votre ${params.vehicle}`,
    text,
    html:
      paragraph(`Bonjour ${params.customerName},`) +
      paragraph(`${params.garageName} a terminé le diagnostic de votre ${params.vehicle} (${params.plate}).`) +
      paragraph(`${params.lineCount} intervention${params.lineCount > 1 ? "s vous sont proposées" : " vous est proposée"}, pour un total de ${total} TTC. Vous pouvez accepter ou refuser chaque intervention indépendamment.`) +
      button(params.url, "Voir le détail et répondre") +
      paragraph(`Ce lien personnel est valable jusqu'au ${formatDateTime(params.expiresAt)}.`) +
      (params.garagePhone ? paragraph(`Une question ? Appelez le garage au ${params.garagePhone}.`) : ""),
  });
}

export async function sendDecisionNoticeEmail(params: {
  to: string;
  garageName: string;
  vehicle: string;
  plate: string;
  acceptedCount: number;
  refusedCount: number;
  acceptedTotal: string;
  url: string;
}): Promise<void> {
  const summary = `${params.acceptedCount} accepté${params.acceptedCount > 1 ? "s" : ""}, ${params.refusedCount} refusé${params.refusedCount > 1 ? "s" : ""} – ${formatEur(params.acceptedTotal)} TTC`;
  await sendMailBestEffort({
    to: params.to,
    subject: `Réponse client : ${params.vehicle} (${params.plate})`,
    text: `Le client a répondu à la proposition de travaux sur la ${params.vehicle} (${params.plate}).\n\n${summary}\n\nOuvrir le dossier : ${params.url}`,
    html: paragraph(`Le client a répondu à la proposition de travaux sur la ${params.vehicle} (${params.plate}).`) + paragraph(summary) + button(params.url, "Ouvrir le dossier"),
  });
}
