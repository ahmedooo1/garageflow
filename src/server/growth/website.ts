import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { emailDomain, normalizeEmail, normalizeUrl, urlHost } from "@/lib/growth/normalize";
import type { WebsiteSignals } from "@/lib/growth/scoring";
import { userAgent } from "./sirene";

/**
 * Vérification du site d'un garage : une seule page (l'accueil), robots.txt
 * respecté, 512 Ko maximum, 8 s maximum par requête, aucune connexion vers une
 * adresse interne.
 *
 * Protection SSRF à deux niveaux : l'URL est vérifiée avant chaque requête
 * (protocole, port, hôte, adresses résolues), puis l'adresse est revérifiée au
 * moment même de la connexion (résolveur DNS du client HTTP), ce qui empêche
 * un nom de domaine de changer d'adresse entre les deux (« DNS rebinding »).
 * Chaque redirection repasse par les deux contrôles.
 *
 * Le contenu de la page est traité comme hostile : on n'en extrait que des
 * signaux booléens et des coordonnées publiées (mailto:, tel:). Le texte
 * lui-même n'est jamais stocké ni transmis à un modèle, ce qui ferme la porte
 * aux injections de consignes.
 */

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

function ipv4Private(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224
  );
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Private(ip);
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) {
    const tail = v6.slice(7);
    return isIP(tail) === 4 ? ipv4Private(tail) : true;
  }
  // ULA, lien local, multicast, NAT64 et 6to4 (peuvent encapsuler une adresse interne), documentation.
  return /^(fc|fd|fe[89ab]|ff|64:ff9b:|2002:|2001:db8:)/.test(v6);
}

export type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((r) => r.address);

export type UrlPolicy = { allowedPorts?: readonly string[] };

/** Refuse tout ce qui n'est pas http(s) public sur les ports standards. */
export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolver, policy: UrlPolicy = {}): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocole refusé");
  if (url.username || url.password) throw new Error("identifiants dans l'URL refusés");
  const ports = policy.allowedPorts ?? ["80", "443"];
  if (url.port && !ports.includes(url.port)) throw new Error("port refusé");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("hôte interne refusé");
  const addresses = isIP(host) ? [host] : await resolve(host);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error("adresse interne refusée");
  return url;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type LookupFn = (hostname: string, callback: (err: Error | null, addresses: LookupAddress[]) => void) => void;

export type GuardOptions = {
  /** Adresse acceptée au moment de la connexion (par défaut : toute adresse publique). */
  isAllowed?: (address: string) => boolean;
  /** Résolution DNS (remplaçable dans les tests). */
  lookup?: LookupFn;
};

const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/**
 * Client HTTP qui revérifie l'adresse IP au moment de la connexion. Les
 * redirections ne sont jamais suivies ici : safeGet les traite une par une.
 */
export function createGuardedFetch(options: GuardOptions = {}): FetchLike {
  const isAllowed = options.isAllowed ?? ((a: string) => !isPrivateAddress(a));
  const resolveAll: LookupFn = options.lookup ?? ((host, cb) => dnsLookup(host, { all: true }, (err, list) => cb(err, list ?? [])));
  const guardedLookup = (hostname: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => {
    resolveAll(hostname, (err, list) => {
      if (err) return cb(err);
      const allowed = list.filter((a) => isAllowed(a.address));
      if (allowed.length === 0 || allowed.length !== list.length) return cb(new Error("adresse interne refusée"));
      if (opts.all) cb(null, allowed);
      else cb(null, allowed[0].address, allowed[0].family);
    });
  };

  return (raw, init) =>
    new Promise<Response>((resolve, reject) => {
      const url = new URL(raw);
      if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && !isAllowed(url.hostname.replace(/^\[|\]$/g, ""))) {
        reject(new Error("adresse interne refusée"));
        return;
      }
      const client = url.protocol === "https:" ? https : http;
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const req = client.request(url, { method: "GET", headers, lookup: guardedLookup as never, timeout: TIMEOUT_MS }, (res) => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(", ") : String(v));
        const status = res.statusCode ?? 502;
        if (NULL_BODY.has(status) || status < 200 || status > 599) {
          res.resume();
          resolve(new Response(null, { status: status < 200 || status > 599 ? 502 : status, headers: h }));
          return;
        }
        resolve(new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, { status, headers: h }));
      });
      const fail = (message: string) => req.destroy(new Error(message));
      req.on("timeout", () => fail("délai dépassé"));
      req.on("error", reject);
      init?.signal?.addEventListener("abort", () => fail("délai dépassé"), { once: true });
      req.end();
    });
}

const guardedFetch = createGuardedFetch();

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

type GetOptions = { doFetch: FetchLike; resolve: Resolver; policy: UrlPolicy; timeoutMs: number };

/** Suit au plus 3 redirections, chacune revérifiée. */
async function safeGet(raw: string, o: GetOptions): Promise<{ response: Response; finalUrl: string }> {
  let current = raw;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const url = await assertPublicUrl(current, o.resolve, o.policy);
    const response = await o.doFetch(url.toString(), {
      redirect: "manual",
      headers: { "User-Agent": userAgent(), Accept: "text/html,text/plain;q=0.9" },
      signal: AbortSignal.timeout(o.timeoutMs),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined);
      current = new URL(location, url).toString();
      continue;
    }
    return { response, finalUrl: url.toString() };
  }
  throw new Error("trop de redirections");
}

/** Motif robots.txt (« * » et « $ ») vers expression régulière. */
function robotsPattern(rule: string): RegExp {
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule).replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/**
 * robots.txt selon la RFC 9309 : on retient le groupe qui nomme notre agent
 * (« garageflow »), sinon le groupe « * » ; la règle la plus longue qui
 * correspond au chemin l'emporte, « Allow » gagnant en cas d'égalité.
 */
export function robotsAllows(robots: string, path = "/"): boolean {
  type Group = { agents: string[]; rules: { allow: boolean; pattern: string }[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  // Notre jeton produit : « GarageFlow-prospection » (voir userAgent()).
  const ours = groups.filter((g) => g.agents.some((a) => a === "garageflow-prospection" || a === "garageflow"));
  const chosen = ours.length ? ours : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!robotsPattern(rule.pattern).test(path)) continue;
    const length = rule.pattern.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best ? best.allow : true;
}

/** Compatibilité : l'accueil (« / ») est-il explorable ? */
export function robotsAllowsHome(robots: string): boolean {
  return robotsAllows(robots, "/");
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

export type CheckOptions = { fetchImpl?: FetchLike; resolve?: Resolver; policy?: UrlPolicy; timeoutMs?: number };

export async function checkWebsite(website: string, opts: CheckOptions = {}): Promise<{ signals: WebsiteSignals; contacts: ExtractedContacts }> {
  const o: GetOptions = {
    doFetch: opts.fetchImpl ?? guardedFetch,
    resolve: opts.resolve ?? defaultResolver,
    policy: opts.policy ?? {},
    timeoutMs: opts.timeoutMs ?? TIMEOUT_MS,
  };
  const home = normalizeUrl(website);
  const empty = { email: "", phone: "" };
  const failed = (error: string, status?: number) => ({
    signals: { checkedUrl: home || website, reachable: false, https: home.startsWith("https:"), onlineBooking: false, marketplaces: [], status, error },
    contacts: empty,
  });
  if (!home) return failed("adresse invalide");

  try {
    // Refus immédiat et explicite d'une adresse non conforme, avant même robots.txt.
    const homeUrl = await assertPublicUrl(home, o.resolve, o.policy);
    // robots.txt : 4xx = pas de règle, 5xx ou réponse illisible = on s'abstient (RFC 9309, § 2.3.1).
    try {
      const { response } = await safeGet(`${homeUrl.origin}/robots.txt`, o);
      if (response.status >= 500) return failed("robots.txt indisponible, exploration reportée", response.status);
      if (response.ok && !robotsAllows(await readCapped(response), homeUrl.pathname || "/")) return failed("exploration refusée par robots.txt");
      if (!response.ok) await response.body?.cancel().catch(() => undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      // Refus de sécurité : on n'ira pas plus loin. Erreur réseau sur robots.txt : on s'abstient aussi.
      return failed(/refus|interne|port|protocole|identifiants/.test(message) ? message.slice(0, 120) : "robots.txt injoignable, exploration reportée");
    }
    const { response, finalUrl } = await safeGet(home, o);
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return failed(`HTTP ${response.status}`, response.status);
    }
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(type)) {
      await response.body?.cancel().catch(() => undefined);
      return failed("contenu non HTML", response.status);
    }
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
