import type { Metadata } from "next";
import { Building2, CreditCard, Euro, Sparkles } from "lucide-react";
import { SearchForm } from "@/components/search-form";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { PLANS, SUBSCRIPTION_STATUS_LABELS } from "@/lib/plans";
import { listGarages, platformStats } from "@/server/services/platform";
import { GarageActions } from "./garage-actions";

export const metadata: Metadata = { title: "Console GarageFlow", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [stats, garages] = await Promise.all([platformStats(), listGarages(q ?? "")]);
  const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <>
      <PageHeader title="Garages" subtitle="Vue d'exploitation : abonnements, usage et incidents. Aucune donnée métier des garages n'est exposée ici." />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Building2} label="Garages inscrits" value={String(stats.garages)} />
        <Kpi icon={Sparkles} label="En essai" value={String(stats.trialing)} />
        <Kpi icon={CreditCard} label="Abonnés actifs" value={String(stats.active)} />
        <Kpi icon={Euro} label="Revenu mensuel HT" value={eur.format(stats.mrrHt)} />
      </div>

      <SearchForm q={q} placeholder="Nom du garage ou email…" />

      {garages.length === 0 ? (
        <EmptyState title="Aucun garage" description={q ? "Aucun résultat pour cette recherche." : "Les garages inscrits apparaîtront ici."} />
      ) : (
        <div className="grid gap-3">
          {garages.map((g) => (
            <Card key={g.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-extrabold">{g.name}</h2>
                    <Pill tone={g.access.canWrite ? (g.access.trialing ? "amber" : "green") : "red"}>{SUBSCRIPTION_STATUS_LABELS[g.access.status]}</Pill>
                    <Pill tone="slate">{PLANS[g.access.plan].name}</Pill>
                    {g.stripeCustomerId && <Pill tone="blue">Stripe</Pill>}
                  </div>
                  <p className="mt-1 text-sm text-ink-2">
                    {g.owner ? `${g.owner.firstName} ${g.owner.lastName} · ${g.owner.email}` : "Aucun gérant"}
                    {g.phone ? ` · ${g.phone}` : ""}
                  </p>
                  <dl className="kv mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
                    <div>
                      <dt>Inscrit le</dt>
                      <dd>{formatDate(g.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>{g.access.trialing ? "Fin d'essai" : "Échéance"}</dt>
                      <dd>{g.access.trialing ? formatDate(g.trialEndsAt) : g.currentPeriodEnd ? formatDate(g.currentPeriodEnd) : "-"}</dd>
                    </div>
                    <div>
                      <dt>Usage</dt>
                      <dd>
                        {g.counts.users}/{g.access.seats} comptes · {g.counts.workOrders} dossiers
                      </dd>
                    </div>
                    <div>
                      <dt>Dernière activité</dt>
                      <dd>{g.lastActivityAt ? formatDate(g.lastActivityAt) : "-"}</dd>
                    </div>
                  </dl>
                  {g.suspendedReason && <p className="mt-2 text-sm font-semibold text-danger">Suspendu : {g.suspendedReason}</p>}
                </div>
                <GarageActions garageId={g.id} garageName={g.name} suspended={g.access.status === "SUSPENDED"} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-steel-900 text-white">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold leading-none">{value}</p>
        <p className="truncate text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      </div>
    </div>
  );
}
