/** Normalisation partagée par le dédoublonnage, la liste d'opposition et l'import. */

const LEGAL_FORMS = /\b(sarl|sas|sasu|eurl|sa|snc|sci|ei|eirl|scop|selarl|ets|etablissements?)\b/g;

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Nom comparable : minuscules, sans accents, sans forme juridique ni ponctuation. */
export function normalizeName(name: string): string {
  return stripAccents(name.toLowerCase())
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL_FORMS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSiret(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

export function normalizePostalCode(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 5 ? digits : "";
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  return /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/.test(email) ? email : "";
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1).toLowerCase() : "";
}

/** Messageries grand public : un domaine partagé ne désigne pas une entreprise. */
const WEBMAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "live.fr",
  "msn.com", "yahoo.com", "yahoo.fr", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net",
  "bbox.fr", "aol.com", "icloud.com", "me.com", "gmx.fr", "gmx.com", "numericable.fr", "club-internet.fr",
]);

export function isWebmailDomain(domain: string): boolean {
  return WEBMAIL.has(domain.toLowerCase());
}

/** URL http(s) canonique, ou chaîne vide si invalide. */
export function normalizeUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname.includes(".")) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function urlHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Clé de dédoublonnage : SIRET quand il est connu, sinon nom normalisé + code postal, sinon email. */
export function dedupeKey(input: { siret?: string; name: string; postalCode?: string; email?: string }): string {
  const siret = normalizeSiret(input.siret ?? "");
  if (siret) return `siret:${siret}`;
  const name = normalizeName(input.name);
  const postal = normalizePostalCode(input.postalCode ?? "");
  if (name && postal) return `name:${name}|${postal}`;
  const email = normalizeEmail(input.email ?? "");
  if (email) return `email:${email}`;
  return `name:${name}|`;
}

/** Libellé de provenance d'inscription : court, sans caractère libre. */
export function sanitizeSource(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
}
