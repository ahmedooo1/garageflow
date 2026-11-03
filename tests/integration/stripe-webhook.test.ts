import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/stripe/webhook/route";
import { prisma } from "@/server/db";
import { cleanupGarage, createTestGarage, type TestGarage } from "./helpers";

/**
 * Webhook Stripe vérifié hors ligne : de vrais événements signés avec la
 * bibliothèque Stripe et un secret de test, envoyés à la vraie route. Aucun
 * appel réseau, aucun paiement. (checkout.session.completed interroge l'API
 * Stripe : il est couvert par le plan de test en mode test, pas ici.)
 */

const SECRET = "whsec_test_hors_ligne_0123456789";
const env = { ...process.env };
let g: TestGarage;
const stripe = new Stripe("sk_test_hors_ligne");

beforeAll(async () => {
  Object.assign(process.env, { STRIPE_SECRET_KEY: "sk_test_hors_ligne", STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_ATELIER: "price_atelier_test", STRIPE_PRICE_RESEAU: "price_reseau_test" });
  g = await createTestGarage("Stripe");
});
afterAll(async () => {
  process.env = env;
  await cleanupGarage(g.garageId);
});

function subscription(status: Stripe.Subscription.Status, price = "price_atelier_test", extra: Record<string, unknown> = {}) {
  return {
    id: "sub_test_1",
    object: "subscription",
    customer: "cus_test_1",
    status,
    cancel_at_period_end: false,
    metadata: { garageId: g.garageId },
    items: { object: "list", data: [{ id: "si_1", object: "subscription_item", price: { id: price, object: "price" }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
    ...extra,
  };
}

async function send(type: string, object: unknown, secret = SECRET) {
  const payload = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, object: "event", type, data: { object }, api_version: "2025-01-01", created: Math.floor(Date.now() / 1000) });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
}

const garage = () => prisma.garage.findUniqueOrThrow({ where: { id: g.garageId } });

describe("webhook Stripe (hors ligne, événements signés)", () => {
  it("refuse une signature absente ou faite avec un autre secret", async () => {
    const r1 = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" }));
    expect(r1.status).toBe(400);
    const r2 = await send("customer.subscription.updated", subscription("active"), "whsec_autre");
    expect(r2.status).toBe(400);
    expect((await garage()).subscriptionStatus).toBe("TRIALING");
  });

  it("un abonnement en attente de paiement ne bloque pas l'essai", async () => {
    expect((await send("customer.subscription.created", subscription("incomplete"))).status).toBe(200);
    expect((await garage()).subscriptionStatus).toBe("TRIALING");
    await send("customer.subscription.updated", subscription("incomplete_expired"));
    expect((await garage()).subscriptionStatus).toBe("TRIALING");
  });

  it("active, change de plan, passe en impayé puis résilie", async () => {
    await send("customer.subscription.updated", subscription("active"));
    let row = await garage();
    expect(row).toMatchObject({ subscriptionStatus: "ACTIVE", plan: "ATELIER", stripeCustomerId: "cus_test_1", stripeSubscriptionId: "sub_test_1" });
    expect(row.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());

    await send("customer.subscription.updated", subscription("active", "price_reseau_test"));
    expect((await garage()).plan).toBe("RESEAU");

    await send("customer.subscription.updated", subscription("past_due", "price_reseau_test"));
    expect((await garage()).subscriptionStatus).toBe("PAST_DUE");

    await send("customer.subscription.updated", subscription("active", "price_reseau_test", { cancel_at_period_end: true }));
    expect((await garage()).cancelAtPeriodEnd).toBe(true);

    await send("customer.subscription.deleted", subscription("canceled", "price_reseau_test"));
    row = await garage();
    expect(row.subscriptionStatus).toBe("CANCELED");
    expect(await prisma.auditLog.count({ where: { garageId: g.garageId, action: "billing.subscription_updated" } })).toBeGreaterThanOrEqual(4);
  });

  it("un prix inconnu ne change pas le plan", async () => {
    await send("customer.subscription.updated", subscription("active", "price_inconnu"));
    expect((await garage()).plan).toBe("RESEAU");
  });
});
