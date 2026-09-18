import type { WorkOrderStatus } from "@prisma/client";
import type { Permission } from "./rbac";

/** Transitions autorisées : état courant → états cibles possibles. */
export const TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  ARRIVED: ["WAITING_DIAGNOSIS", "DIAGNOSIS_IN_PROGRESS", "CANCELLED"],
  WAITING_DIAGNOSIS: ["DIAGNOSIS_IN_PROGRESS", "CANCELLED"],
  DIAGNOSIS_IN_PROGRESS: ["WAITING_CUSTOMER_APPROVAL", "READY_FOR_PICKUP", "CANCELLED"],
  WAITING_CUSTOMER_APPROVAL: [
    "APPROVED",
    "PARTIALLY_APPROVED",
    "DIAGNOSIS_IN_PROGRESS",
    "READY_FOR_PICKUP",
    "CANCELLED",
  ],
  APPROVED: ["WAITING_PARTS", "REPAIR_IN_PROGRESS", "CANCELLED"],
  PARTIALLY_APPROVED: ["WAITING_PARTS", "REPAIR_IN_PROGRESS", "CANCELLED"],
  WAITING_PARTS: ["REPAIR_IN_PROGRESS", "CANCELLED"],
  REPAIR_IN_PROGRESS: ["QUALITY_CONTROL", "WAITING_PARTS"],
  QUALITY_CONTROL: ["READY_FOR_PICKUP", "REPAIR_IN_PROGRESS"],
  READY_FOR_PICKUP: ["DELIVERED"],
  DELIVERED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: readonly WorkOrderStatus[] = ["CLOSED", "CANCELLED"];

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: WorkOrderStatus,
    public readonly to: WorkOrderStatus,
  ) {
    super(`Transition impossible : ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isTerminal(status: WorkOrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Actions manuelles déclenchables depuis le dossier. Les transitions pilotées
 * par le système (envoi estimation, décision client, restitution) passent par
 * leurs services dédiés et ne figurent pas ici.
 */
export type WorkOrderAction = {
  key: string;
  label: string;
  from: readonly WorkOrderStatus[];
  to: WorkOrderStatus;
  permission: Permission;
  tone: "primary" | "neutral" | "danger" | "success";
  requiresFinalCheck?: boolean;
};

export const WORK_ORDER_ACTIONS: readonly WorkOrderAction[] = [
  {
    key: "QUEUE_DIAGNOSIS",
    label: "Mettre en attente de diagnostic",
    from: ["ARRIVED"],
    to: "WAITING_DIAGNOSIS",
    permission: "repair:transition",
    tone: "neutral",
  },
  {
    key: "START_DIAGNOSIS",
    label: "Commencer le diagnostic",
    from: ["ARRIVED", "WAITING_DIAGNOSIS"],
    to: "DIAGNOSIS_IN_PROGRESS",
    permission: "repair:transition",
    tone: "primary",
  },
  {
    key: "NO_WORK_NEEDED",
    label: "Aucun travaux : véhicule prêt",
    from: ["DIAGNOSIS_IN_PROGRESS"],
    to: "READY_FOR_PICKUP",
    permission: "repair:transition",
    tone: "neutral",
  },
  {
    key: "WAIT_PARTS",
    label: "Attente de pièces",
    from: ["APPROVED", "PARTIALLY_APPROVED", "REPAIR_IN_PROGRESS"],
    to: "WAITING_PARTS",
    permission: "repair:transition",
    tone: "neutral",
  },
  {
    key: "START_REPAIR",
    label: "Commencer la réparation",
    from: ["APPROVED", "PARTIALLY_APPROVED", "WAITING_PARTS"],
    to: "REPAIR_IN_PROGRESS",
    permission: "repair:transition",
    tone: "primary",
  },
  {
    key: "FINISH_REPAIR",
    label: "Réparation terminée : contrôle final",
    from: ["REPAIR_IN_PROGRESS"],
    to: "QUALITY_CONTROL",
    permission: "repair:transition",
    tone: "primary",
  },
  {
    key: "BACK_TO_REPAIR",
    label: "Retour en réparation",
    from: ["QUALITY_CONTROL"],
    to: "REPAIR_IN_PROGRESS",
    permission: "repair:transition",
    tone: "neutral",
  },
  {
    key: "MARK_READY",
    label: "Marquer véhicule prêt",
    from: ["QUALITY_CONTROL"],
    to: "READY_FOR_PICKUP",
    permission: "repair:transition",
    tone: "success",
    requiresFinalCheck: true,
  },
  {
    key: "CLOSE",
    label: "Clôturer le dossier",
    from: ["DELIVERED"],
    to: "CLOSED",
    permission: "workorders:close",
    tone: "success",
  },
  {
    key: "CANCEL",
    label: "Annuler le dossier",
    from: [
      "ARRIVED",
      "WAITING_DIAGNOSIS",
      "DIAGNOSIS_IN_PROGRESS",
      "WAITING_CUSTOMER_APPROVAL",
      "APPROVED",
      "PARTIALLY_APPROVED",
      "WAITING_PARTS",
    ],
    to: "CANCELLED",
    permission: "workorders:cancel",
    tone: "danger",
  },
];

export function getAction(key: string): WorkOrderAction | undefined {
  return WORK_ORDER_ACTIONS.find((a) => a.key === key);
}

export function availableActions(status: WorkOrderStatus): WorkOrderAction[] {
  return WORK_ORDER_ACTIONS.filter((a) => a.from.includes(status) && canTransition(status, a.to));
}
