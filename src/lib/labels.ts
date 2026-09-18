import type {
  CheckStatus,
  DamageType,
  EstimateStatus,
  FuelType,
  LineDecision,
  PhotoType,
  Urgency,
  WorkOrderStatus,
} from "@prisma/client";

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  ARRIVED: "Réceptionné",
  WAITING_DIAGNOSIS: "À diagnostiquer",
  DIAGNOSIS_IN_PROGRESS: "Diagnostic en cours",
  WAITING_CUSTOMER_APPROVAL: "Attente client",
  APPROVED: "Accepté",
  PARTIALLY_APPROVED: "Partiellement accepté",
  WAITING_PARTS: "Attente pièces",
  REPAIR_IN_PROGRESS: "En réparation",
  QUALITY_CONTROL: "Contrôle final",
  READY_FOR_PICKUP: "Véhicule prêt",
  DELIVERED: "Restitué",
  CLOSED: "Clôturé",
  CANCELLED: "Annulé",
};

/** Ton visuel d'un statut, utilisé par le composant StatusBadge. */
export const STATUS_TONES: Record<WorkOrderStatus, "slate" | "blue" | "amber" | "orange" | "green" | "red" | "purple"> = {
  ARRIVED: "slate",
  WAITING_DIAGNOSIS: "slate",
  DIAGNOSIS_IN_PROGRESS: "blue",
  WAITING_CUSTOMER_APPROVAL: "amber",
  APPROVED: "green",
  PARTIALLY_APPROVED: "green",
  WAITING_PARTS: "orange",
  REPAIR_IN_PROGRESS: "blue",
  QUALITY_CONTROL: "purple",
  READY_FOR_PICKUP: "green",
  DELIVERED: "slate",
  CLOSED: "slate",
  CANCELLED: "red",
};

export type KanbanColumn = { key: string; label: string; statuses: readonly WorkOrderStatus[] };

export const KANBAN_COLUMNS: readonly KanbanColumn[] = [
  { key: "to-diagnose", label: "À diagnostiquer", statuses: ["ARRIVED", "WAITING_DIAGNOSIS"] },
  { key: "diagnosis", label: "Diagnostic", statuses: ["DIAGNOSIS_IN_PROGRESS"] },
  { key: "waiting-customer", label: "Attente client", statuses: ["WAITING_CUSTOMER_APPROVAL"] },
  { key: "waiting-parts", label: "Attente pièces", statuses: ["WAITING_PARTS"] },
  { key: "to-repair", label: "À réparer", statuses: ["APPROVED", "PARTIALLY_APPROVED"] },
  { key: "repairing", label: "En réparation", statuses: ["REPAIR_IN_PROGRESS"] },
  { key: "quality", label: "Contrôle final", statuses: ["QUALITY_CONTROL"] },
  { key: "ready", label: "Prêt", statuses: ["READY_FOR_PICKUP"] },
];

export const ACTIVE_STATUSES: readonly WorkOrderStatus[] = KANBAN_COLUMNS.flatMap((c) => [...c.statuses]);

export const URGENCY_LABELS: Record<Urgency, string> = {
  INFO: "Information",
  WATCH: "À surveiller",
  RECOMMENDED: "Recommandé",
  URGENT: "Urgent",
  CRITICAL: "Critique",
};

export const URGENCY_ORDER: Urgency[] = ["INFO", "WATCH", "RECOMMENDED", "URGENT", "CRITICAL"];

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  NOT_CHECKED: "Non contrôlé",
  OK: "OK",
  WATCH: "À surveiller",
  RECOMMENDED: "Recommandé",
  URGENT: "Urgent",
};

export const CHECK_STATUS_ORDER: CheckStatus[] = ["OK", "WATCH", "RECOMMENDED", "URGENT", "NOT_CHECKED"];

export const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  FRONT: "Avant",
  REAR: "Arrière",
  LEFT: "Côté gauche",
  RIGHT: "Côté droit",
  INTERIOR: "Intérieur",
  DASHBOARD: "Tableau de bord",
  DAMAGE: "Dommage",
  FINDING: "Constat",
  CHECKLIST: "Contrôle",
  OTHER: "Photo libre",
};

export const CONDITION_PHOTO_TYPES: PhotoType[] = ["FRONT", "REAR", "LEFT", "RIGHT", "INTERIOR", "DASHBOARD", "OTHER"];

export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  SCRATCH: "Rayure",
  DENT: "Bosse",
  IMPACT: "Impact",
  RIM: "Jante",
  WINDSHIELD: "Pare-brise",
  OTHER: "Autre",
};

export const FUEL_LABELS: Record<FuelType, string> = {
  PETROL: "Essence",
  DIESEL: "Diesel",
  HYBRID: "Hybride",
  ELECTRIC: "Électrique",
  LPG: "GPL",
  OTHER: "Autre",
};

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyée au client",
  DECIDED: "Décision reçue",
  SUPERSEDED: "Remplacée",
};

export const DECISION_LABELS: Record<LineDecision, string> = {
  PENDING: "En attente",
  ACCEPTED: "Accepté",
  REFUSED: "Refusé",
};

export const FINDING_CATEGORIES = [
  "Freinage",
  "Pneumatiques",
  "Moteur",
  "Distribution",
  "Échappement",
  "Transmission",
  "Suspension / Direction",
  "Électricité",
  "Climatisation",
  "Carrosserie",
  "Éclairage",
  "Visibilité",
  "Entretien",
  "Autre",
] as const;

export type ChecklistDefinition = { key: string; label: string; section: string };

export const CHECKLIST_SECTIONS: readonly { section: string; items: readonly { key: string; label: string }[] }[] = [
  {
    section: "Pneus",
    items: [
      { key: "TIRE_FL", label: "Pneu avant gauche (AVG)" },
      { key: "TIRE_FR", label: "Pneu avant droit (AVD)" },
      { key: "TIRE_RL", label: "Pneu arrière gauche (ARG)" },
      { key: "TIRE_RR", label: "Pneu arrière droit (ARD)" },
    ],
  },
  {
    section: "Freins",
    items: [
      { key: "BRAKE_PADS_FRONT", label: "Plaquettes avant" },
      { key: "BRAKE_PADS_REAR", label: "Plaquettes arrière" },
      { key: "BRAKE_DISCS_FRONT", label: "Disques avant" },
      { key: "BRAKE_DISCS_REAR", label: "Disques arrière" },
    ],
  },
  {
    section: "Moteur",
    items: [
      { key: "ENGINE_OIL", label: "Huile" },
      { key: "ENGINE_LEAKS", label: "Fuites" },
      { key: "ENGINE_COOLING", label: "Refroidissement" },
      { key: "ENGINE_BATTERY", label: "Batterie" },
    ],
  },
  {
    section: "Visibilité",
    items: [
      { key: "VIS_WINDSHIELD", label: "Pare-brise" },
      { key: "VIS_WIPERS", label: "Essuie-glaces" },
    ],
  },
  {
    section: "Éclairage",
    items: [
      { key: "LIGHT_HEADLIGHTS", label: "Feux" },
      { key: "LIGHT_INDICATORS", label: "Clignotants" },
      { key: "LIGHT_BRAKE", label: "Feux stop" },
    ],
  },
];

export const CHECKLIST_ITEMS: readonly ChecklistDefinition[] = CHECKLIST_SECTIONS.flatMap((s) =>
  s.items.map((i) => ({ key: i.key, label: i.label, section: s.section })),
);

export const CHECKLIST_KEYS = new Set(CHECKLIST_ITEMS.map((i) => i.key));

export function checklistLabel(key: string): string {
  return CHECKLIST_ITEMS.find((i) => i.key === key)?.label ?? key;
}

export const TIMELINE_LABELS: Record<string, string> = {
  WORK_ORDER_CREATED: "Véhicule réceptionné",
  STATUS_CHANGED: "Statut modifié",
  TECHNICIAN_ASSIGNED: "Technicien assigné",
  PHOTO_ADDED: "Photo ajoutée",
  DAMAGE_ADDED: "Dommage documenté",
  FINDING_ADDED: "Constat ajouté",
  FINDING_UPDATED: "Constat modifié",
  FINDING_DELETED: "Constat supprimé",
  CHECKLIST_UPDATED: "Contrôle mis à jour",
  ESTIMATE_CREATED: "Estimation créée",
  ESTIMATE_LINE_ADDED: "Travaux proposés",
  ESTIMATE_LINE_REMOVED: "Ligne retirée",
  ESTIMATE_SENT: "Validation envoyée au client",
  ESTIMATE_SUPERSEDED: "Estimation remplacée",
  CUSTOMER_DECISION: "Décision du client",
  LINE_COMPLETED: "Travaux réalisés",
  FINAL_CHECK_SAVED: "Contrôle final enregistré",
  VEHICLE_READY: "Véhicule prêt",
  VEHICLE_DELIVERED: "Véhicule restitué",
  WORK_ORDER_CLOSED: "Dossier clôturé",
  WORK_ORDER_CANCELLED: "Dossier annulé",
};
