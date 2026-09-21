import nodemailer, { type Transporter } from "nodemailer";

export type Mail = {
  to: string;
  subject: string;
  /** Version texte, toujours envoyée (lisible partout, bonne délivrabilité). */
  text: string;
  /** Version HTML facultative : encapsulée dans la charte GarageFlow. */
  html?: string;
};

let transporter: Transporter | null = null;

function smtpTransport(): Transporter {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host) throw new Error("SMTP_HOST est requis quand MAIL_TRANSPORT=smtp");
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });
  return transporter;
}

export function mailFrom(): string {
  return process.env.MAIL_FROM ?? "GarageFlow <no-reply@garageflow.local>";
}

/**
 * Envoi d'email. `MAIL_TRANSPORT=log` (défaut) écrit dans les logs serveur,
 * ce qui permet de travailler en local sans service tiers. `smtp` utilise
 * les variables SMTP_*.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const transport = process.env.MAIL_TRANSPORT ?? "log";
  // "silent" : utilisé par la suite de tests, aucun effet de bord.
  if (transport === "silent") return;
  if (transport === "log") {
    console.info(`[mail] from=${mailFrom()} to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  if (transport !== "smtp") throw new Error(`Transport email inconnu : ${transport}`);
  try {
    await smtpTransport().sendMail({
      from: mailFrom(),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html ? layout(mail.subject, mail.html) : undefined,
    });
  } catch (e) {
    // Un email qui échoue ne doit jamais faire échouer l'action métier.
    console.error(`[mail] échec d'envoi vers ${mail.to}`, e);
    throw e;
  }
}

/** Envoi « au mieux » : l'échec est journalisé mais n'interrompt pas l'action. */
export async function sendMailBestEffort(mail: Mail): Promise<boolean> {
  try {
    await sendMail(mail);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Gabarit HTML commun : tableaux et styles en ligne pour les clients mail. */
function layout(title: string, content: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px 12px;background:#eef0f3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141a22;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d9dde3;">
<tr><td style="background:#161c24;padding:18px 24px;">
<span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-.02em;">Garage<span style="color:#e2590f;">Flow</span></span>
</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55;">${content}</td></tr>
<tr><td style="padding:16px 24px;background:#f6f7f9;color:#6b7684;font-size:12px;">
Message automatique envoyé par GarageFlow. Merci de ne pas y répondre.
</td></tr></table></body></html>`;
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td style="background:#e2590f;border-radius:10px;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 24px;color:#ffffff;font-weight:700;text-decoration:none;font-size:15px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

export { escapeHtml };
