import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { emailDomain, normalizeEmail, normalizeUrl, urlHost } from "@/lib/growth/normalize";
import type { WebsiteSignals } from "@/lib/growth/scoring";
import { USER_AGENT } from "./sirene";

/**
 * Vérification du site d'un garage : une seule page (l'accueil), robots.txt
 * respecté, 512 Ko maximum, 8 s maximum, aucune redirection vers une adresse
 * interne.
 *
 * Le contenu de la page est traité comme hostile : on n'en extrait que des
 * signaux booléens et des coordonnées publiées (mailto:, tel:). Le texte
 * lui-même n'est jamais stocké ni transmis à un modèle, ce qui ferme la porte
 * aux injections de consignes.
 */

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8_000;

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

export type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((r) => r.address);

/** Refuse tout ce qui n'est pas http(s) public sur les ports standards. */
export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocole refusé");
  if (url.username || url.password) throw new Error("identifiants dans l'URL refusés");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("port refusé");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("hôte interne refusé");
  const addresses = isIP(host) ? [host] : await resolve(host);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error("adresse interne refusée");
  return url;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

/** Suit au plus 3 redirections, chacune revérifiée. */
async function safeGet(raw: string, doFetch: FetchLike, resolve: Resolver): Promise<{ response: Response; finalUrl: string }> {
  let current = raw;
  for (let i = 0; i < 4; i++) {
    const url = await assertPublicUrl(current, resolve);
    const response = await doFetch(url.toString(), {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain;q=0.9" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }
    return { response, finalUrl: url.toString() };
  }
  throw new Error("trop de redirections");
}

/** robots.txt minimal : groupes « * » et notre agent, règles Disallow sur l'accueil. */
export function robotsAllowsHome(robots: string): boolean {
  let applies = false;
  let blocked = false;
  let allowed = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, field, value] = m;
    const key = field.toLowerCase();
    if (key === "user-agent") applies = value === "*" || /garageflow/i.test(value);
    else if (applies && key === "disallow" && (value === "/" || value === "/*")) blocked = true;
    else if (applies && key === "allow" && value === "/") allowed = true;
  }
  return allowed || !blocked;
}

const BOOKING = /(prendre|prise de|réserver|reserver|réservation|reservation)\s+(un\s+)?(rendez[- ]vous|rdv)|rdv en ligne|rendez-vous en ligne|réservation en ligne|reservation en ligne/i;
const MARKETPLACES: Record<string, string> = {
  "idgarages.com": "iDGARAGES",
  "vroomly.com": "Vroomly",
  "autobutler.fr": "Autobutler",
  "goodmecano.com": "GoodMecano",
};

export type ExtractedContacts = { email: string; phone: string };

/** Signaux et coordonnées publiées, extraits du HTML sans l'interpréter. */
export function extractSignals(html: string, pageUrl: string): { booking: boolean; marketplaces: string[]; contacts: ExtractedContacts } {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  const booking = BOOKING.test(text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "));
  const marketplaces = Object.entries(MARKETPLACES)
    .filter(([domain]) => new RegExp(`https?://(www\\.)?${domain.replace(/\./g, "\\.")}`, "i").test(html))
    .map(([, label]) => label);

  const siteHost = urlHost(pageUrl);
  const emails = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => normalizeEmail(decodeURIComponent(m[1]))).filter(Boolean);
  // Préférence pour une adresse du domaine du site, sinon la première publiée.
  const email = emails.find((e) => siteHost && emailDomain(e).endsWith(siteHost)) ?? emails[0] ?? "";
  const tel = html.match(/tel:(\+?[\d\s.()-]{9,20})/i)?.[1] ?? "";
  const digits = tel.replace(/[^\d+]/g, "");
  const phone = /^(\+33|0)\d{9}$/.test(digits) ? digits : "";
  return { booking, marketplaces, contacts: { email, phone } };
}

export async function checkWebsite(
  website: string,
  opts: { fetchImpl?: FetchLike; resolve?: Resolver } = {},
): Promise<{ signals: WebsiteSignals; contacts: ExtractedContacts }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const resolve = opts.resolve ?? defaultResolver;
  const home = normalizeUrl(website);
  const empty = { email: "", phone: "" };
  const failed = (error: string, status?: number) => ({
    signals: { checkedUrl: home || website, reachable: false, https: home.startsWith("https:"), onlineBooking: false, marketplaces: [], status, error },
    contacts: empty,
  });
  if (!home) return failed("adresse invalide");

  try {
    const origin = new URL(home).origin;
    try {
      const { response } = await safeGet(`${origin}/robots.txt`, doFetch, resolve);
      if (response.ok && !robotsAllowsHome(await readCapped(response))) return failed("exploration refusée par robots.txt");
    } catch {
      // Pas de robots.txt lisible : l'accueil reste consultable.
    }
    const { response, finalUrl } = await safeGet(home, doFetch, resolve);
    if (!response.ok) return failed(`HTTP ${response.status}`, response.status);
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(type)) return failed("contenu non HTML", response.status);
    const html = await readCapped(response);
    const { booking, marketplaces, contacts } = extractSignals(html, finalUrl);
    return {
      signals: { checkedUrl: finalUrl, reachable: true, https: finalUrl.startsWith("https:"), onlineBooking: booking, marketplaces, status: response.status },
      contacts,
    };
  } catch (e) {
    return failed(e instanceof Error ? e.message.slice(0, 120) : "erreur réseau");
  }
}
