import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/server/services/billing";

export const runtime = "nodejs";

/**
 * Réception des événements Stripe. La signature est vérifiée avec
 * STRIPE_WEBHOOK_SECRET : aucune donnée n'est acceptée sans elle.
 */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature manquante" }, { status: 400 });
  const payload = await req.text();
  try {
    await handleStripeWebhook(payload, signature);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe] webhook rejeté", e);
    return NextResponse.json({ error: "Webhook invalide" }, { status: 400 });
  }
}
