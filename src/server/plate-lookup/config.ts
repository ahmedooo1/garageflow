import type { PlateProvider } from "./provider";
import { demoProvider } from "./providers/demo";

/**
 * Configuration, lue uniquement côté serveur (aucune variable NEXT_PUBLIC_) :
 *
 *   PLATE_LOOKUP_PROVIDER            identifiant du fournisseur ; vide = recherche désactivée
 *   PLATE_LOOKUP_API_KEY             clé du fournisseur (secret du serveur, jamais envoyé au navigateur)
 *   PLATE_LOOKUP_TIMEOUT_MS          délai maximal d'un appel (défaut 8000, de 1000 à 20000)
 *   PLATE_LOOKUP_CACHE_DAYS          conservation des résultats par garage (défaut 30, 0 = aucune)
 *   PLATE_LOOKUP_GLOBAL_MONTHLY_CAP  plafond mensuel d'appels pour toute la plateforme (défaut 1000)
 *
 * Ajouter un fournisseur : un fichier dans providers/, puis une entrée ici.
 */
const PROVIDERS: Record<string, PlateProvider> = {
  demo: demoProvider,
};

export type PlateLookupConfig = {
  provider: PlateProvider;
  apiKey: string;
  timeoutMs: number;
  cacheDays: number;
  globalMonthlyCap: number;
};

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
}

export function plateLookupConfig(env: NodeJS.ProcessEnv = process.env): PlateLookupConfig | null {
  const id = (env.PLATE_LOOKUP_PROVIDER ?? "").trim().toLowerCase();
  if (!id) return null;
  const provider = PROVIDERS[id];
  if (!provider) {
    console.warn(`[plaque] fournisseur inconnu « ${id} » : recherche désactivée`);
    return null;
  }
  // Données fictives : jamais devant de vrais utilisateurs.
  if (provider.id === "demo" && env.NODE_ENV === "production") {
    console.warn("[plaque] fournisseur de démonstration refusé en production : recherche désactivée");
    return null;
  }
  const apiKey = (env.PLATE_LOOKUP_API_KEY ?? "").trim();
  if (provider.id !== "demo" && apiKey.length < 8) {
    console.warn("[plaque] PLATE_LOOKUP_API_KEY absente : recherche désactivée");
    return null;
  }
  return {
    provider,
    apiKey,
    timeoutMs: bounded(env.PLATE_LOOKUP_TIMEOUT_MS, 8000, 1000, 20_000),
    cacheDays: provider.cacheAllowed ? bounded(env.PLATE_LOOKUP_CACHE_DAYS, 30, 0, 365) : 0,
    globalMonthlyCap: bounded(env.PLATE_LOOKUP_GLOBAL_MONTHLY_CAP, 1000, 0, 1_000_000),
  };
}
