import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, Pill } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, LEAD_STAGES } from "@/lib/growth/labels";
import { zoneLabel } from "@/lib/growth/zones";
import { aiModel } from "@/server/growth/ai";
import { JOBS, listJobRuns } from "@/server/growth/jobs";
import { formatRate, growthMetrics } from "@/server/growth/metrics";
import { listDraftQueue, sendingEnabled } from "@/server/growth/outreach";
import { getGrowthSettings, missingSenderFields } from "@/server/growth/settings";
import { listSuppressions } from "@/server/growth/suppression";
import { JobRunner, SettingsForm, SuppressionForm } from "./growth-forms";

export const metadata: Metadata = { title: "Croissance", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-2xl font-extrabold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span>{label}</span>
      <Pill tone={ok ? "green" : "slate"}>{ok ? "configuré" : "absent"}</Pill>
    </li>
  );
}

export default async function GrowthPage() {
  const [m, runs, settings, queue, suppressions] = await Promise.all([growthMetrics(), listJobRuns(20), getGrowthSettings(), listDraftQueue(), listSuppressions(50)]);
  const missing = missingSenderFields();
  const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <>
      <PageHeader title="Croissance" subtitle="Indicateurs calculés sur les données réelles de la base. Un « - » signifie qu'il n'y a pas encore assez de données pour un taux." />

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Produit</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Inscriptions (30 j)" value={String(m.product.signups30)} hint={`${m.product.signupsAll} au total`} />
        <Stat label="Activation" value={formatRate(m.product.activation)} hint="Garages ayant créé au moins un dossier" />
        <Stat label="Essai vers payant" value={formatRate(m.product.trialToPaid)} hint="Parmi les essais terminés" />
        <Stat label="Revenu mensuel HT" value={eur.format(m.product.mrrHt)} hint={`${m.product.active} abonné(s) actif(s), ${m.product.canceled} résilié(s)`} />
      </div>

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Prospection</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Brouillons à relire" value={String(m.sales.pendingReview)} />
        <Stat label="Messages envoyés (30 j)" value={String(m.sales.sent30)} />
        <Stat label="Taux de réponse" value={formatRate(m.sales.replyRate)} hint="Contactés ayant répondu" />
        <Stat label="Démos demandées (30 j)" value={String(m.sales.demoRequests30)} hint={`${m.sales.leadsWithTrial} prospect(s) inscrit(s)`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Entonnoir">
          <ul className="divide-y divide-line text-sm">
            {LEAD_STAGES.map((s) => (
              <li key={s} className="flex justify-between py-1.5">
                <Link href={`/admin/prospects?stage=${s}`} className="hover:underline">
                  {LEAD_STAGE_LABELS[s]}
                </Link>
                <span className="font-bold tabular-nums">{m.sales.stageCounts[s]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Sources : {m.sales.bySource.map((s) => `${LEAD_SOURCE_LABELS[s.source]} ${s.count}`).join(" · ") || "-"}
            <br />
            Zones : {m.sales.byZone.map((z) => `${zoneLabel(z.zone)} ${z.count}`).join(" · ") || "-"}
          </p>
        </Card>

        <Card title="Audience (30 j, sans cookie)">
          <p className="text-sm">
            <strong>{m.traffic.views30}</strong> pages vues.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <ul>
              {m.traffic.byPath.map((p) => (
                <li key={p.path} className="flex justify-between">
                  <span>{p.path}</span>
                  <span className="tabular-nums">{p.count}</span>
                </li>
              ))}
            </ul>
            <ul>
              {m.traffic.bySource.map((s) => (
                <li key={s.source} className="flex justify-between gap-2">
                  <span className="truncate">{s.source}</span>
                  <span className="tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-xs text-muted">Provenance des inscriptions : {m.product.bySignupSource.map((s) => `${s.source} ${s.count}`).join(" · ") || "-"}</p>
        </Card>

        <Card title="File de relecture">
          {queue.length === 0 ? (
            <p className="text-sm text-muted">Aucun brouillon en attente.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {queue.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/admin/prospects/${d.lead.id}`} className="font-semibold hover:underline">
                    {d.lead.name}
                  </Link>
                  <Pill tone={d.status === "APPROVED" ? "blue" : "amber"}>{d.status === "APPROVED" ? "Approuvé, à envoyer" : "À relire"}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tâches">
          <JobRunner jobs={JOBS} />
        </Card>

        <Card title="Réglages">
          <SettingsForm paused={settings.paused} aiEnabled={settings.aiEnabled} budget={settings.aiMonthlyBudgetUsd} />
          <p className="mt-3 text-xs text-muted">
            Dépense ce mois : {m.aiSpendUsd.toFixed(2)} $ sur {settings.aiMonthlyBudgetUsd} $ · modèle {aiModel()}
          </p>
        </Card>

        <Card title="Configuration du serveur">
          <ul className="divide-y divide-line">
            <Check ok={missing.length === 0} label="Identité de l'expéditeur (nom, société, adresse)" />
            <Check ok={sendingEnabled()} label="Envoi depuis GarageFlow (OUTREACH_SEND_ENABLED)" />
            <Check ok={(process.env.GROWTH_CRON_SECRET ?? "").length >= 32} label="Tâches planifiées (GROWTH_CRON_SECRET)" />
            <Check ok={Boolean(process.env.GROWTH_REPORT_TO)} label="Destinataire des rapports (GROWTH_REPORT_TO)" />
            <Check ok={Boolean(process.env.ANTHROPIC_API_KEY)} label="Rédaction assistée (ANTHROPIC_API_KEY)" />
            <Check ok={process.env.MAIL_TRANSPORT === "smtp"} label="Transport email SMTP" />
          </ul>
          {missing.length > 0 && <p className="mt-2 text-xs text-muted">Manquant : {missing.join(", ")}</p>}
        </Card>

        <Card title="Exécutions récentes">
          {runs.length === 0 ? (
            <p className="text-sm text-muted">Aucune exécution.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {runs.map((r) => (
                <li key={r.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {r.job}
                      {r.dryRun ? " (simulation)" : ""}
                    </span>
                    <Pill tone={r.status === "SUCCEEDED" ? "green" : r.status === "FAILED" ? "red" : r.status === "RUNNING" ? "blue" : "slate"}>{r.status}</Pill>
                  </div>
                  <p className="text-xs text-muted">
                    {formatDateTime(r.startedAt)} · {r.trigger} · essai {r.attempts}
                    {r.error ? ` · ${r.error}` : ""}
                  </p>
                  {r.stats && <p className="mt-1 break-all font-mono text-[11px] text-ink-2">{JSON.stringify(r.stats).slice(0, 300)}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Liste d'opposition">
          <SuppressionForm />
          <ul className="mt-3 divide-y divide-line text-sm">
            {suppressions.map((s) => (
              <li key={s.id} className="flex justify-between gap-2 py-1.5">
                <span className="truncate">
                  {s.kind} · {s.value}
                </span>
                <span className="shrink-0 text-xs text-muted">{s.origin}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
