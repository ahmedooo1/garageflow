import type { Plan, SubscriptionStatus } from "@prisma/client";

export type PlanDefinition = {
  key: Plan;
  name: string;
  /** Prix mensuel hors taxes, en euros. */
  priceHt: number;
  /** Nombre de comptes utilisateurs actifs autorisés. */
  seats: number;
  tagline: string;
  features: readonly string[];
};

export const PLANS: Record<Plan, PlanDefinition> = {
  ATELIER: {
    key: "ATELIER",
    name: "Atelier",
    priceHt: 59,
    seats: 5,
    tagline: "Pour un garage indépendant et son équipe.",
    features: [
      "Jusqu'à 5 comptes (gérant, réception, techniciens)",
      "Dossiers, photos et diagnostics illimités",
      "Validation client par lien sécurisé",
      "Tableau d'atelier et historique complet",
      "Support par email",
    ],
  },
  RESEAU: {
    key: "RESEAU",
    name: "Réseau",
    priceHt: 129,
    seats: 50,
    tagline: "Pour les structures à forte rotation.",
    features: [
      "Jusqu'à 50 comptes utilisateurs",
      "Tout le plan Atelier",
      "Stockage photos S3 dédié",
      "Export des données à la demande",
      "Support prioritaire",
    ],
  },
};

export const PLAN_ORDER: readonly Plan[] = ["ATELIER", "RESEAU"];

export const TRIAL_DAYS = 14;

/** Pendant l'essai, les limites du plan Atelier s'appliquent. */
export const TRIAL_SEATS = PLANS.ATELIER.seats;

export const PLAN_LABELS: Record<Plan, string> = {
  ATELIER: PLANS.ATELIER.name,
  RESEAU: PLANS.RESEAU.name,
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: "Essai gratuit",
  ACTIVE: "Abonnement actif",
  PAST_DUE: "Paiement en attente",
  CANCELED: "Abonnement résilié",
  SUSPENDED: "Compte suspendu",
};

export type SubscriptionSnapshot = {
  plan: Plan;
  status: SubscriptionStatus;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  suspendedAt: Date | null;
  suspendedReason: string;
};

export type AccessState = {
  /** L'écriture est-elle autorisée (création, modification, transitions) ? */
  canWrite: boolean;
  /** Raison lisible quand l'écriture est bloquée. */
  reason: string | null;
  /** Essai en cours. */
  trialing: boolean;
  /** Jours restants d'essai (0 si terminé ou hors essai). */
  trialDaysLeft: number;
  /** Nombre de comptes utilisateurs autorisés. */
  seats: number;
  plan: Plan;
  status: SubscriptionStatus;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Détermine les droits d'un garage à un instant donné. La lecture reste
 * toujours possible : seule l'écriture est bloquée quand l'abonnement ne
 * couvre plus le service, afin que le garage garde accès à ses données.
 */
export function evaluateAccess(sub: SubscriptionSnapshot, now = Date.now()): AccessState {
  const seats = sub.status === "TRIALING" ? TRIAL_SEATS : PLANS[sub.plan].seats;
  const base = { trialing: false, trialDaysLeft: 0, seats, plan: sub.plan, status: sub.status };

  if (sub.suspendedAt || sub.status === "SUSPENDED") {
    return { ...base, canWrite: false, reason: sub.suspendedReason || "Ce compte est suspendu. Contactez le support GarageFlow." };
  }

  if (sub.status === "TRIALING") {
    const msLeft = sub.trialEndsAt.getTime() - now;
    if (msLeft <= 0) {
      return { ...base, canWrite: false, reason: "Votre essai gratuit est terminé. Choisissez un abonnement pour continuer à enregistrer des dossiers." };
    }
    return { ...base, canWrite: true, reason: null, trialing: true, trialDaysLeft: Math.max(1, Math.ceil(msLeft / DAY_MS)) };
  }

  if (sub.status === "ACTIVE" || sub.status === "PAST_DUE") {
    // Un paiement en retard laisse une période de tolérance jusqu'à la fin de période.
    const expired = sub.currentPeriodEnd !== null && sub.currentPeriodEnd.getTime() < now;
    if (expired) {
      return { ...base, canWrite: false, reason: "Votre abonnement a expiré. Mettez à jour votre moyen de paiement pour continuer." };
    }
    return { ...base, canWrite: true, reason: null };
  }

  return { ...base, canWrite: false, reason: "Votre abonnement est résilié. Réactivez-le pour continuer à enregistrer des dossiers." };
}

export function formatPriceHt(plan: PlanDefinition): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(plan.priceHt);
}
