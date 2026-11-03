import type { Confidence, LeadSource } from "@prisma/client";
import { normalizeName } from "./normalize";
import { workforceLabel } from "./labels";
import { isZoneKey, TARGET_NAF, ZONES } from "./zones";

/**
 * Qualification transparente : chaque point du score vient d'un fait observé
 * (registre SIRENE, site web du garage, information saisie avec sa source).
 * Aucun appel à un modèle ici : le même prospect donne toujours le même score.
 */

export type WebsiteSignals = {
  checkedUrl: string;
  reachable: boolean;
  https: boolean;
  onlineBooking: boolean;
  /** Plateformes de réservation reconnues sur la page d'accueil (idgarages, vroomly…). */
  marketplaces: string[];
  status?: number;
  error?: string;
};

export type ScoringInput = {
  name: string;
  nafCode: string;
  zone: string;
  workforceRange: string;
  establishmentsCount: number | null;
  companyCreatedOn: Date | null;
  source: LeadSource;
  sourceUrl: string;
  sourceFetchedAt: Date;
  website: string;
  websiteSignals: WebsiteSignals | null;
  websiteCheckedAt: Date | null;
  email: string;
  emailSourceUrl: string;
  phone: string;
  phoneSourceUrl: string;
  demoRequestedAt: Date | null;
};

export type Evidence = {
  key: string;
  label: string;
  points: number;
  evidence: string;
  sourceUrl: string;
  observedAt: string;
};

export type ScoreResult = {
  score: number;
  confidence: Confidence;
  evidence: Evidence[];
  hypothesis: string;
  /** Exclu de la prospection (réseau national, activité hors cible…). */
  disqualified: boolean;
};

/** Seuil à partir duquel un prospect découvert passe « qualifié ». */
export const QUALIFY_THRESHOLD = 50;

/**
 * Enseignes de réseaux nationaux : ces ateliers sont en général équipés par
 * leur réseau. On ne les prospecte pas (hypothèse prudente, affichée comme telle).
 */
export const NATIONAL_NETWORKS = [
  "speedy", "norauto", "midas", "feu vert", "point s", "euromaster", "carglass", "france pare brise", "mondial pare brise",
  "vulco", "first stop", "profil plus", "ad garage", "ad expert", "top carrosserie", "motrio", "eurorepar", "bosch car service",
  "precisium", "autodistribution", "carrosserie 3d", "auto primo", "roady", "le garage moderne", "autobacs",
  "dekra", "securitest", "autosur", "norisko",
];

export function matchedNetwork(name: string): string | null {
  const n = ` ${normalizeName(name)} `;
  for (const brand of NATIONAL_NETWORKS) if (n.includes(` ${brand} `)) return brand;
  return null;
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export function scoreLead(input: ScoringInput, now = new Date()): ScoreResult {
  const evidence: Evidence[] = [];
  const src = input.sourceUrl;
  const at = input.sourceFetchedAt.toISOString();
  const add = (e: Omit<Evidence, "sourceUrl" | "observedAt"> & Partial<Pick<Evidence, "sourceUrl" | "observedAt">>) =>
    evidence.push({ sourceUrl: src, observedAt: at, ...e });
  let disqualified = false;

  // Activité déclarée
  if (input.nafCode === TARGET_NAF) {
    add({ key: "naf", label: "Activité ciblée", points: 25, evidence: `Code NAF ${TARGET_NAF} : entretien et réparation de véhicules légers` });
  } else if (input.nafCode === "45.20B") {
    add({ key: "naf", label: "Activité voisine", points: 5, evidence: "Code NAF 45.20B : réparation d'autres véhicules (poids lourds, utilitaires)" });
  } else if (input.nafCode) {
    add({ key: "naf", label: "Activité hors cible", points: 0, evidence: `Code NAF ${input.nafCode}` });
  }

  // Zone
  if (isZoneKey(input.zone)) {
    add({ key: "zone", label: "Zone de lancement", points: 10, evidence: `Établissement situé dans la zone ${ZONES[input.zone].label}` });
  }

  // Indépendance
  const network = matchedNetwork(input.name);
  if (network) {
    disqualified = true;
    add({ key: "network", label: "Réseau national probable", points: -40, evidence: `Le nom contient « ${network} » : atelier probablement équipé par son réseau` });
  } else if (input.establishmentsCount !== null && input.establishmentsCount > 5) {
    add({ key: "independent", label: "Plusieurs établissements", points: -15, evidence: `${input.establishmentsCount} établissements ouverts pour cette entreprise` });
  } else if (input.establishmentsCount !== null && input.establishmentsCount <= 2) {
    add({ key: "independent", label: "Garage indépendant", points: 15, evidence: `${input.establishmentsCount} établissement(s) ouvert(s) pour cette entreprise` });
  }

  // Taille d'équipe
  const wf = input.workforceRange;
  if (["01", "02", "03"].includes(wf)) {
    add({ key: "team", label: "Petite équipe", points: 15, evidence: `Effectif déclaré : ${workforceLabel(wf)}` });
  } else if (["11", "12"].includes(wf)) {
    add({ key: "team", label: "Équipe moyenne", points: 10, evidence: `Effectif déclaré : ${workforceLabel(wf)}` });
  } else if (wf === "00") {
    add({ key: "team", label: "Sans salarié", points: 5, evidence: "Effectif déclaré : 0 salarié" });
  }

  // Ancienneté
  if (input.companyCreatedOn && now.getTime() - input.companyCreatedOn.getTime() >= 2 * YEAR_MS) {
    add({ key: "established", label: "Entreprise établie", points: 5, evidence: `Créée le ${input.companyCreatedOn.toISOString().slice(0, 10)}` });
  }

  // Site web (observé, jamais supposé)
  const ws = input.websiteSignals;
  if (ws && input.websiteCheckedAt) {
    const observedAt = input.websiteCheckedAt.toISOString();
    if (ws.reachable) {
      add({ key: "website", label: "Site web en ligne", points: 5, evidence: `Page d'accueil accessible (${ws.https ? "HTTPS" : "HTTP"})`, sourceUrl: ws.checkedUrl, observedAt });
      if (ws.onlineBooking) {
        add({ key: "booking", label: "Rendez-vous en ligne", points: 5, evidence: "La page d'accueil mentionne une prise de rendez-vous en ligne", sourceUrl: ws.checkedUrl, observedAt });
      }
      if (ws.marketplaces.length > 0) {
        add({ key: "marketplace", label: "Présent sur une plateforme", points: 0, evidence: `Lien vers : ${ws.marketplaces.join(", ")}`, sourceUrl: ws.checkedUrl, observedAt });
      }
    } else {
      add({ key: "website", label: "Site web injoignable", points: 0, evidence: ws.error ? `Échec : ${ws.error}` : "La page d'accueil ne répond pas", sourceUrl: ws.checkedUrl, observedAt });
    }
  }

  // Joignabilité (une coordonnée ne compte que si sa source est connue)
  if (input.email && input.emailSourceUrl) {
    add({ key: "email", label: "Email professionnel sourcé", points: 15, evidence: `Adresse publiée par le garage`, sourceUrl: input.emailSourceUrl });
  }
  if (input.phone && input.phoneSourceUrl) {
    add({ key: "phone", label: "Téléphone sourcé", points: 5, evidence: "Numéro publié par le garage", sourceUrl: input.phoneSourceUrl });
  }

  if (input.demoRequestedAt) {
    add({ key: "demo", label: "Démo demandée", points: 30, evidence: "Le garage a rempli le formulaire de démonstration", observedAt: input.demoRequestedAt.toISOString() });
  }

  if (input.nafCode && input.nafCode !== TARGET_NAF && input.nafCode !== "45.20B") disqualified = true;

  const raw = evidence.reduce((sum, e) => sum + e.points, 0);
  const score = Math.max(0, Math.min(disqualified ? 20 : 100, raw));

  const identityVerified = input.source === "SIRENE" || input.source === "INBOUND_DEMO";
  const contactable = Boolean(input.email && (input.emailSourceUrl || input.source === "INBOUND_DEMO"));
  const confidence: Confidence =
    identityVerified && contactable && input.websiteCheckedAt ? "HIGH" : identityVerified && (contactable || input.websiteCheckedAt) ? "MEDIUM" : "LOW";

  return { score, confidence, evidence, hypothesis: buildHypothesis(input, { network, disqualified }), disqualified };
}

/** Hypothèse rédigée à partir des seuls faits ci-dessus, présentée comme à vérifier. */
export function buildHypothesis(input: ScoringInput, ctx: { network: string | null; disqualified: boolean }): string {
  if (ctx.network) return "Atelier probablement rattaché à un réseau national et équipé par lui : à ne pas prospecter, sauf information contraire.";
  if (ctx.disqualified) return "Activité déclarée hors de la réparation automobile : vérifier avant tout contact.";
  const parts: string[] = [];
  const wf = input.workforceRange;
  if (["01", "02", "03", "11", "12"].includes(wf)) {
    parts.push(
      `Avec une équipe déclarée de ${workforceLabel(wf)}, la réception, le diagnostic et l'accord du client passent probablement par plusieurs personnes : un dossier partagé et la validation des travaux par lien pourraient éviter des relances téléphoniques.`,
    );
  } else if (wf === "00") {
    parts.push("Garage sans salarié déclaré : l'intérêt principal serait la validation des travaux par lien, avec une trace écrite et horodatée de l'accord du client.");
  } else {
    parts.push("La validation des travaux par lien (diagnostic, photos, prix ligne par ligne) pourrait réduire les allers-retours pour obtenir l'accord du client.");
  }
  if (input.websiteSignals?.onlineBooking) parts.push("Le site mentionne déjà la prise de rendez-vous en ligne : le garage utilise des outils numériques avec ses clients.");
  if (!input.email) parts.push("Aucune adresse email sourcée : rechercher le contact publié par le garage avant toute prise de contact.");
  return `Hypothèse à vérifier. ${parts.join(" ")}`;
}
