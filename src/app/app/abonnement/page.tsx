import type { Metadata } from "next";
import { CheckCircle2, Users } from "lucide-react";
import { Alert, Card, PageHeader, Pill } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatPriceHt, PLANS, PLAN_ORDER, SUBSCRIPTION_STATUS_LABELS, TRIAL_DAYS } from "@/lib/plans";
import { assertPermission, requireUser } from "@/server/context";
import { prisma } from "@/server/db";
import { getSeatUsage, getSubscription, stripeEnabled } from "@/server/services/billing";
import { CheckoutButton, PortalButton } from "./billing-forms";

export const metadata: Metadata = { title: "Abonnement" };
export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ paiement?: string }> }) {
  const { paiement } = await searchParams;
  const { ctx, access } = await requireUser();
  assertPermission(ctx, "garage:settings");
  const [subscription, seats, garage] = await Promise.all([
    getSubscription(ctx.garageId),
    getSeatUsage(ctx.garageId),
    prisma.garage.findUnique({ where: { id: ctx.garageId }, select: { stripeCustomerId: true } }),
  ]);
  const stripeReady = stripeEnabled();
  const hasStripeCustomer = Boolean(garage?.stripeCustomerId);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Abonnement" subtitle="Votre plan, vos comptes utilisateurs et votre facturation." />

      {paiement === "succes" && (
        <Alert tone="ok" className="mb-4">
          Merci. Votre paiement a été enregistré. L&apos;abonnement s&apos;active dès la confirmation de Stripe, sous une minute.
        </Alert>
      )}
      {paiement === "annule" && (
        <Alert tone="info" className="mb-4">
          Paiement abandonné. Aucun montant n&apos;a été prélevé.
        </Alert>
      )}

      <div className="grid gap-4">
        <Card title="Votre formule">
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone={access.canWrite ? (access.trialing ? "amber" : "green") : "red"} size="lg">
              {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
            </Pill>
            <span className="text-lg font-extrabold">Plan {PLANS[subscription.plan].name}</span>
          </div>

          <dl className="kv mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {access.trialing && (
              <div>
                <dt>Fin de l&apos;essai</dt>
                <dd className="font-semibold">
                  {formatDate(subscription.trialEndsAt)}
                  <span className="block text-sm text-muted">
                    {access.trialDaysLeft} jour{access.trialDaysLeft > 1 ? "s" : ""} restant{access.trialDaysLeft > 1 ? "s" : ""}
                  </span>
                </dd>
              </div>
            )}
            {subscription.currentPeriodEnd && (
              <div>
                <dt>{subscription.cancelAtPeriodEnd ? "Fin de l'accès" : "Prochaine échéance"}</dt>
                <dd className="font-semibold">{formatDate(subscription.currentPeriodEnd)}</dd>
              </div>
            )}
            <div>
              <dt>Comptes utilisateurs</dt>
              <dd className="font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-muted" />
                  {seats.used} / {seats.limit}
                </span>
              </dd>
            </div>
          </dl>

          {!access.canWrite && (
            <Alert tone="danger" className="mt-5">
              {access.reason} Vos données restent consultables et vous pouvez les exporter depuis les paramètres.
            </Alert>
          )}

          {hasStripeCustomer && stripeReady && (
            <div className="mt-5 border-t border-line pt-5">
              <p className="mb-2 text-sm text-muted">Moyen de paiement, factures et résiliation.</p>
              <PortalButton />
            </div>
          )}
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const current = subscription.plan === key && subscription.status === "ACTIVE";
            return (
              <Card key={key} className={current ? "ring-2 ring-ok" : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-extrabold">{plan.name}</h3>
                    <p className="text-sm text-muted">{plan.tagline}</p>
                  </div>
                  {current && <Pill tone="green">Plan actuel</Pill>}
                </div>
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold tracking-tight">{formatPriceHt(plan)}</span>
                  <span className="text-sm font-semibold text-muted">/ mois HT</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {stripeReady ? (
                    <CheckoutButton plan={key} label={current ? "Gérer" : `Souscrire · ${plan.name}`} disabled={current} />
                  ) : (
                    <a href="mailto:contact@garageflow.fr?subject=Abonnement%20GarageFlow" className="btn btn-dark btn-block">
                      Demander l&apos;activation
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {!stripeReady && (
          <Alert tone="info">
            Le paiement en ligne n&apos;est pas activé sur cette instance. Écrivez à contact@garageflow.fr : votre abonnement sera activé manuellement
            sous 24 heures ouvrées.
          </Alert>
        )}

        <p className="text-sm text-muted">
          Essai de {TRIAL_DAYS} jours offert à la création du garage, sans carte bancaire. Abonnement mensuel sans engagement, résiliable à tout moment.
          Les prix sont hors taxes.
        </p>
      </div>
    </div>
  );
}
