export type Mail = { to: string; subject: string; text: string };

/**
 * Transport email minimal. En mode "log" (défaut, dev/démo) le contenu est
 * écrit dans les logs serveur. Brancher un vrai transport SMTP ici pour la prod.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const transport = process.env.MAIL_TRANSPORT ?? "log";
  if (transport === "log") {
    console.info(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  throw new Error(`Transport email inconnu : ${transport}`);
}
