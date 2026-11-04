import type { ParsedPlate } from "@/lib/plate";

/**
 * Contrat d'un fournisseur de données techniques par immatriculation.
 *
 * Un adaptateur ne fait que deux choses : envoyer l'immatriculation (et rien
 * d'autre) au fournisseur, et recopier dans `RawTechnical` les champs
 * techniques de sa réponse. Il ne lit jamais les champs relatifs au
 * titulaire. Le nettoyage (`sanitizeTechnical`) reconstruit ensuite l'objet
 * à partir de la seule liste blanche : un champ inattendu est ignoré.
 */
export type RawTechnical = Partial<
  Record<
    "make" | "model" | "version" | "vin" | "firstRegistrationDate" | "modelYear" | "fuel" | "engine" | "displacementCc" | "powerKw" | "powerHp" | "fiscalPower" | "gearbox",
    unknown
  >
>;

export type ProviderOutcome = { found: true; raw: RawTechnical } | { found: false };

export type PlateProvider = {
  id: string;
  /** Affiché à l'utilisateur comme source des données. */
  label: string;
  /** Le fournisseur facture-t-il une immatriculation inconnue ? (conditions du contrat) */
  billsNotFound: boolean;
  /** Le contrat autorise-t-il la conservation temporaire des résultats ? */
  cacheAllowed: boolean;
  lookup(plate: ParsedPlate, ctx: { apiKey: string; signal: AbortSignal; fetchImpl: typeof fetch }): Promise<ProviderOutcome>;
};

export type ProviderErrorCode = "timeout" | "unavailable" | "auth" | "provider_rate_limit" | "invalid_response";

export class PlateProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    /** Une requête a-t-elle pu être facturée ? (prudence : oui dès qu'elle a été envoyée) */
    readonly billable: boolean,
    detail = "",
  ) {
    super(`fournisseur : ${code}${detail ? ` (${detail})` : ""}`);
    this.name = "PlateProviderError";
  }
}

const MAX_RESPONSE_BYTES = 256 * 1024;

/**
 * Appel JSON vers un fournisseur : délai imposé par l'appelant, pas de
 * redirection suivie (la clé ne doit partir vers aucun autre hôte), réponse
 * plafonnée, statuts HTTP traduits en erreurs typées. 404 = inconnu.
 */
export async function fetchProviderJson(url: string, init: RequestInit & { signal: AbortSignal }, fetchImpl: typeof fetch = fetch): Promise<{ notFound: true } | { notFound: false; json: unknown }> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, redirect: "error", cache: "no-store" });
  } catch (e) {
    if (init.signal.aborted) throw new PlateProviderError("timeout", true);
    throw new PlateProviderError("unavailable", false, e instanceof Error ? e.message : "réseau");
  }
  if (res.status === 404) return { notFound: true };
  if (res.status === 401 || res.status === 403) throw new PlateProviderError("auth", false, String(res.status));
  if (res.status === 429) throw new PlateProviderError("provider_rate_limit", false);
  if (!res.ok) throw new PlateProviderError("unavailable", true, String(res.status));

  const reader = res.body?.getReader();
  if (!reader) throw new PlateProviderError("invalid_response", true, "corps vide");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read().catch(() => {
      throw new PlateProviderError(init.signal.aborted ? "timeout" : "unavailable", true);
    });
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new PlateProviderError("invalid_response", true, "réponse trop volumineuse");
    }
    chunks.push(value);
  }
  try {
    return { notFound: false, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    throw new PlateProviderError("invalid_response", true, "JSON illisible");
  }
}
