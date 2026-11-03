import type { Confidence, DraftKind, DraftStatus, LeadSource, LeadStage } from "@prisma/client";

export const LEAD_STAGES: readonly LeadStage[] = [
  "DISCOVERED",
  "QUALIFIED",
  "READY_FOR_REVIEW",
  "CONTACTED",
  "REPLIED",
  "DEMO_BOOKED",
  "TRIAL",
  "CONVERTED",
  "NOT_INTERESTED",
  "DO_NOT_CONTACT",
];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  DISCOVERED: "Découvert",
  QUALIFIED: "Qualifié",
  READY_FOR_REVIEW: "À relire",
  CONTACTED: "Contacté",
  REPLIED: "A répondu",
  DEMO_BOOKED: "Démo planifiée",
  TRIAL: "En essai",
  CONVERTED: "Client",
  NOT_INTERESTED: "Pas intéressé",
  DO_NOT_CONTACT: "Ne pas contacter",
};

export const LEAD_STAGE_TONES: Record<LeadStage, "slate" | "blue" | "amber" | "orange" | "green" | "red" | "purple"> = {
  DISCOVERED: "slate",
  QUALIFIED: "blue",
  READY_FOR_REVIEW: "amber",
  CONTACTED: "orange",
  REPLIED: "purple",
  DEMO_BOOKED: "purple",
  TRIAL: "green",
  CONVERTED: "green",
  NOT_INTERESTED: "slate",
  DO_NOT_CONTACT: "red",
};

/** Étapes après lesquelles plus aucun message de prospection n'est préparé. */
export const CLOSED_STAGES: readonly LeadStage[] = ["TRIAL", "CONVERTED", "NOT_INTERESTED", "DO_NOT_CONTACT"];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  SIRENE: "Base SIRENE (INSEE)",
  CSV_IMPORT: "Import CSV",
  MANUAL: "Saisie manuelle",
  INBOUND_DEMO: "Demande de démo",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = { LOW: "Faible", MEDIUM: "Moyenne", HIGH: "Élevée" };

export const DRAFT_KIND_LABELS: Record<DraftKind, string> = {
  FIRST_CONTACT: "Premier contact",
  DEMO_INVITE: "Invitation à une démo",
  FOLLOW_UP: "Relance",
};

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  DRAFT: "Brouillon",
  APPROVED: "Approuvé",
  SENT: "Envoyé",
  DISCARDED: "Abandonné",
};

/** Tranches d'effectif salarié INSEE. */
export const WORKFORCE_LABELS: Record<string, string> = {
  NN: "non employeur ou non renseigné",
  "00": "0 salarié",
  "01": "1 ou 2 salariés",
  "02": "3 à 5 salariés",
  "03": "6 à 9 salariés",
  "11": "10 à 19 salariés",
  "12": "20 à 49 salariés",
  "21": "50 à 99 salariés",
  "22": "100 à 199 salariés",
  "31": "200 à 249 salariés",
  "32": "250 à 499 salariés",
  "41": "500 à 999 salariés",
  "42": "1 000 à 1 999 salariés",
  "51": "2 000 à 4 999 salariés",
  "52": "5 000 à 9 999 salariés",
  "53": "10 000 salariés et plus",
};

export function workforceLabel(code: string): string {
  return WORKFORCE_LABELS[code] ?? "non renseigné";
}
