import { describe, expect, it } from "vitest";
import { evaluateAccess, PLANS, TRIAL_SEATS, type SubscriptionSnapshot } from "@/lib/plans";

const NOW = new Date("2026-06-01T10:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function snapshot(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    plan: "ATELIER",
    status: "TRIALING",
    trialEndsAt: new Date(NOW + 10 * DAY),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    suspendedAt: null,
    suspendedReason: "",
    ...overrides,
  };
}

describe("droits d'abonnement", () => {
  it("autorise l'écriture pendant l'essai et compte les jours restants", () => {
    const access = evaluateAccess(snapshot({ trialEndsAt: new Date(NOW + 3 * DAY) }), NOW);
    expect(access.canWrite).toBe(true);
    expect(access.trialing).toBe(true);
    expect(access.trialDaysLeft).toBe(3);
    expect(access.reason).toBeNull();
    expect(access.seats).toBe(TRIAL_SEATS);
  });

  it("arrondit au jour supérieur et ne descend jamais sous 1 tant que l'essai court", () => {
    expect(evaluateAccess(snapshot({ trialEndsAt: new Date(NOW + 90 * 60_000) }), NOW).trialDaysLeft).toBe(1);
    expect(evaluateAccess(snapshot({ trialEndsAt: new Date(NOW + 1_000) }), NOW).trialDaysLeft).toBe(1);
  });

  it("bloque l'écriture dès l'essai terminé", () => {
    const access = evaluateAccess(snapshot({ trialEndsAt: new Date(NOW - 1_000) }), NOW);
    expect(access.canWrite).toBe(false);
    expect(access.trialing).toBe(false);
    expect(access.trialDaysLeft).toBe(0);
    expect(access.reason).toMatch(/essai gratuit est terminé/i);
  });

  it("autorise l'écriture sur un abonnement actif et applique les places du plan", () => {
    const access = evaluateAccess(snapshot({ status: "ACTIVE", plan: "RESEAU", currentPeriodEnd: new Date(NOW + 20 * DAY) }), NOW);
    expect(access.canWrite).toBe(true);
    expect(access.trialing).toBe(false);
    expect(access.seats).toBe(PLANS.RESEAU.seats);
  });

  it("tolère un paiement en retard jusqu'à la fin de la période payée", () => {
    expect(evaluateAccess(snapshot({ status: "PAST_DUE", currentPeriodEnd: new Date(NOW + DAY) }), NOW).canWrite).toBe(true);
    const expired = evaluateAccess(snapshot({ status: "PAST_DUE", currentPeriodEnd: new Date(NOW - DAY) }), NOW);
    expect(expired.canWrite).toBe(false);
    expect(expired.reason).toMatch(/expiré/i);
  });

  it("bloque un abonnement résilié", () => {
    const access = evaluateAccess(snapshot({ status: "CANCELED", currentPeriodEnd: new Date(NOW - DAY) }), NOW);
    expect(access.canWrite).toBe(false);
    expect(access.reason).toMatch(/résilié/i);
  });

  it("la suspension prime sur tout le reste, même un abonnement payé", () => {
    const access = evaluateAccess(
      snapshot({ status: "ACTIVE", currentPeriodEnd: new Date(NOW + 300 * DAY), suspendedAt: new Date(NOW - DAY), suspendedReason: "Impayé" }),
      NOW,
    );
    expect(access.canWrite).toBe(false);
    expect(access.reason).toBe("Impayé");
  });

  it("fournit un motif par défaut quand la suspension n'en précise aucun", () => {
    const access = evaluateAccess(snapshot({ status: "SUSPENDED" }), NOW);
    expect(access.canWrite).toBe(false);
    expect(access.reason).toMatch(/suspendu/i);
  });

  it("les plans exposent un prix et un nombre de places cohérents", () => {
    expect(PLANS.ATELIER.priceHt).toBeGreaterThan(0);
    expect(PLANS.RESEAU.priceHt).toBeGreaterThan(PLANS.ATELIER.priceHt);
    expect(PLANS.RESEAU.seats).toBeGreaterThan(PLANS.ATELIER.seats);
  });
});
