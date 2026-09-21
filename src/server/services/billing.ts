import type { Plan, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import { evaluateAccess, PLANS, TRIAL_DAYS, type AccessState, type SubscriptionSnapshot } from "@/lib/plans";
import { assertPermission, type Ctx } from "@/server/context";
import { prisma } from "@/server/db";
import { AppError, NotFoundError } from "@/server/lib/errors";
import { audit } from "./audit";

// ---------------------------------------------------------------------------
// État de l'abonnement
// ---------------------------------------------------------------------------

export function trialEndDate(from = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

const SUBSCRIPTION_SELECT = {
  plan: true,
  subscriptionStatus: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  suspendedAt: true,
  suspendedReason: true,
} as const;

function toSnapshot(g: {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  suspendedAt: Date | null;
  suspendedReason: string;
}): SubscriptionSnapshot {
  return {
    plan: g.plan,
    status: g.subscriptionStatus,
    trialEndsAt: g.trialEndsAt,
    currentPeriodEnd: g.currentPeriodEnd,
    cancelAtPeriodEnd: g.cancelAtPeriodEnd,
    suspendedAt: g.suspendedAt,
    suspendedReason: g.suspendedReason,
  };
}

export async function getSubscription(garageId: string): Promise<SubscriptionSnapshot> {
  const garage = await prisma.garage.findUnique({ where: { id: garageId }, select: SUBSCRIPTION_SELECT });
  if (!garage) throw new NotFoundError("Garage introuvable");
  return toSnapshot(garage);
}

export async function getAccess(garageId: string): Promise<AccessState> {
  return evaluateAccess(await getSubscription(garageId));
}

/** Comptes actifs consommés / autorisés pour ce garage. */
export async function getSeatUsage(garageId: string): Promise<{ used: number; limit: number }> {
  const [access, used] = await Promise.all([getAccess(garageId), prisma.user.count({ where: { garageId, active: true } })]);
  return { used, limit: access.seats };
}

/** Lève une erreur si le garage a atteint le nombre de comptes de son plan. */
export async function assertSeatAvailable(garageId: string): Promise<void> {
  const { used, limit } = await getSeatUsage(garageId);
  if (used >= limit) {
    throw new AppError(`Votre plan autorise ${limit} comptes actifs. Passez à un plan supérieur ou désactivez un compte pour en ajouter un nouveau.`);
  }
}

// ---------------------------------------------------------------------------
// Stripe (optionnel : l'application fonctionne sans, activation manuelle)
// ---------------------------------------------------------------------------

let stripeClient: Stripe | null = null;

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && priceId("ATELIER") && priceId("RESEAU"));
}

function priceId(plan: Plan): string | undefined {
  return plan === "ATELIER" ? process.env.STRIPE_PRICE_ATELIER : process.env.STRIPE_PRICE_RESEAU;
}

function planFromPrice(id: string | undefined): Plan | null {
  if (!id) return null;
  if (id === process.env.STRIPE_PRICE_ATELIER) return "ATELIER";
  if (id === process.env.STRIPE_PRICE_RESEAU) return "RESEAU";
  return null;
}

function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new AppError("Le paiement en ligne n'est pas configuré. Contactez GarageFlow pour activer votre abonnement.");
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

/** Crée une session de paiement Stripe et renvoie l'URL de redirection. */
export async function createCheckoutSession(ctx: Ctx, plan: Plan, appUrl: string): Promise<string> {
  assertPermission(ctx, "garage:settings");
  if (!stripeEnabled()) throw new AppError("Le paiement en ligne n'est pas configuré. Contactez GarageFlow pour activer votre abonnement.");
  const garage = await prisma.garage.findUnique({ where: { id: ctx.garageId }, select: { id: true, name: true, email: true, stripeCustomerId: true } });
  if (!garage) throw new NotFoundError("Garage introuvable");

  let customerId = garage.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({
      name: garage.name,
      email: garage.email || undefined,
      metadata: { garageId: garage.id },
    });
    customerId = customer.id;
    await prisma.garage.update({ where: { id: garage.id }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId(plan)!, quantity: 1 }],
    client_reference_id: garage.id,
    subscription_data: { metadata: { garageId: garage.id } },
    success_url: `${appUrl}/app/abonnement?paiement=succes`,
    cancel_url: `${appUrl}/app/abonnement?paiement=annule`,
    locale: "fr",
  });
  await audit({ garageId: ctx.garageId, userId: ctx.userId, action: "billing.checkout_started", entityType: "Garage", entityId: ctx.garageId, ip: ctx.ip, metadata: { plan } });
  if (!session.url) throw new AppError("Stripe n'a pas renvoyé d'URL de paiement");
  return session.url;
}

/** Portail Stripe : moyen de paiement, factures, résiliation. */
export async function createPortalSession(ctx: Ctx, appUrl: string): Promise<string> {
  assertPermission(ctx, "garage:settings");
  const garage = await prisma.garage.findUnique({ where: { id: ctx.garageId }, select: { stripeCustomerId: true } });
  if (!garage?.stripeCustomerId) throw new AppError("Aucun abonnement Stripe rattaché à ce garage.");
  const session = await stripe().billingPortal.sessions.create({
    customer: garage.stripeCustomerId,
    return_url: `${appUrl}/app/abonnement`,
  });
  return session.url;
}

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    default:
      return "CANCELED";
  }
}

/** Applique un abonnement Stripe sur le garage correspondant. */
async function applySubscription(subscription: Stripe.Subscription): Promise<void> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const garage = await prisma.garage.findFirst({
    where: { OR: [{ stripeCustomerId: customerId }, { id: subscription.metadata?.garageId ?? "__none__" }] },
    select: { id: true },
  });
  if (!garage) {
    console.warn(`[stripe] abonnement ${subscription.id} sans garage correspondant`);
    return;
  }
  const item = subscription.items.data[0];
  const plan = planFromPrice(item?.price?.id);
  const periodEnd = item?.current_period_end ?? null;
  await prisma.garage.update({
    where: { id: garage.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: mapStatus(subscription.status),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      ...(plan ? { plan } : {}),
    },
  });
  await audit({
    garageId: garage.id,
    action: "billing.subscription_updated",
    entityType: "Garage",
    entityId: garage.id,
    metadata: { status: subscription.status, plan: plan ?? "inchangé", subscriptionId: subscription.id },
  });
}

/** Vérifie la signature Stripe puis traite l'événement. */
export async function handleStripeWebhook(payload: string, signature: string): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new AppError("STRIPE_WEBHOOK_SECRET manquant", 500, "CONFIG");
  const event = stripe().webhooks.constructEvent(payload, signature, secret);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (typeof session.subscription === "string") {
        await applySubscription(await stripe().subscriptions.retrieve(session.subscription));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Activation manuelle (console plateforme, sans Stripe)
// ---------------------------------------------------------------------------

export type ManualActivation = { plan: Plan; months: number };

export async function activateManually(garageId: string, input: ManualActivation, actorId: string): Promise<void> {
  const months = Math.min(Math.max(Math.round(input.months), 1), 36);
  if (!PLANS[input.plan]) throw new AppError("Plan inconnu");
  const end = new Date();
  end.setMonth(end.getMonth() + months);
  await prisma.garage.update({
    where: { id: garageId },
    data: { plan: input.plan, subscriptionStatus: "ACTIVE", currentPeriodEnd: end, suspendedAt: null, suspendedReason: "", cancelAtPeriodEnd: false },
  });
  await audit({ garageId, userId: actorId, action: "billing.manual_activation", entityType: "Garage", entityId: garageId, metadata: { plan: input.plan, months } });
}
