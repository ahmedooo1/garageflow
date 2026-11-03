import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { formatDate, nowMs } from "@/lib/format";
import { CONFIDENCE_LABELS, LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, LEAD_STAGE_TONES, LEAD_STAGES } from "@/lib/growth/labels";
import { ZONE_KEYS, ZONES, zoneLabel } from "@/lib/growth/zones";
import { listLeads } from "@/server/growth/leads";

export const metadata: Metadata = { title: "Prospects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = { q?: string; stage?: string; zone?: string; minScore?: string; email?: string; demo?: string; due?: string };

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const leads = await listLeads({
    q: sp.q,
    stage: sp.stage,
    zone: sp.zone,
    minScore: Number(sp.minScore) || undefined,
    hasEmail: sp.email === "1",
    demo: sp.demo === "1",
    due: sp.due === "1",
  });
  const now = nowMs();

  return (
    <>
      <PageHeader
        title="Prospects"
        subtitle="Garages trouvés dans des sources publiques ou qui nous ont écrit. Chaque information affiche sa source ; rien n'est envoyé sans votre approbation."
        actions={
          <>
            <a href="/api/admin/prospects/export" className="btn btn-secondary btn-sm">
              <Download className="h-4 w-4" /> Exporter
            </a>
            <Link href="/admin/prospects/new" className="btn btn-dark btn-sm">
              <Plus className="h-4 w-4" /> Ajouter ou importer
            </Link>
          </>
        }
      />

      <form method="get" className="card mb-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-8" role="search">
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Nom, ville, SIRET, email" className="input col-span-2" />
        <select name="stage" defaultValue={sp.stage ?? ""} className="input" aria-label="Étape">
          <option value="">Toutes les étapes</option>
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="zone" defaultValue={sp.zone ?? ""} className="input" aria-label="Zone">
          <option value="">Toutes les zones</option>
          {ZONE_KEYS.map((z) => (
            <option key={z} value={z}>
              {ZONES[z].label}
            </option>
          ))}
        </select>
        <select name="minScore" defaultValue={sp.minScore ?? ""} className="input" aria-label="Score minimal">
          <option value="">Tout score</option>
          <option value="50">50 et plus</option>
          <option value="70">70 et plus</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="email" value="1" defaultChecked={sp.email === "1"} /> Avec email
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="demo" value="1" defaultChecked={sp.demo === "1"} /> Démo demandée
        </label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="due" value="1" defaultChecked={sp.due === "1"} /> Relance due
          </label>
          <button type="submit" className="btn btn-dark btn-sm ml-auto">
            Filtrer
          </button>
        </div>
      </form>

      {leads.length === 0 ? (
        <EmptyState
          title="Aucun prospect"
          description="Lancez la découverte SIRENE depuis l'onglet Croissance, importez un CSV sourcé, ou ajoutez un garage à la main."
          action={
            <Link href="/admin/croissance" className="btn btn-dark btn-sm">
              Ouvrir Croissance
            </Link>
          }
        />
      ) : (
        <Card>
          <p className="mb-3 text-sm text-muted">{leads.length} prospect(s), triés par demande de démo puis par score.</p>
          <ul className="divide-y divide-line">
            {leads.map((l) => {
              const overdue = l.nextFollowUpAt && l.nextFollowUpAt.getTime() <= now;
              return (
                <li key={l.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/admin/prospects/${l.id}`} className="font-bold text-ink hover:underline">
                      {l.name}
                    </Link>
                    <p className="text-sm text-muted">
                      {[l.city, zoneLabel(l.zone)].filter(Boolean).join(" · ")} · {LEAD_SOURCE_LABELS[l.source]}
                      {l.email ? " · email sourcé" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {l.demoRequestedAt && <Pill tone="purple">Démo demandée</Pill>}
                    {l._count.drafts > 0 && <Pill tone="amber">{l._count.drafts} à relire</Pill>}
                    {overdue && <Pill tone="red">Relance le {formatDate(l.nextFollowUpAt!)}</Pill>}
                    <Pill tone={LEAD_STAGE_TONES[l.stage]}>{LEAD_STAGE_LABELS[l.stage]}</Pill>
                    <span className="w-24 text-right text-sm font-bold tabular-nums" title={`Confiance ${CONFIDENCE_LABELS[l.confidence].toLowerCase()}`}>
                      {l.score}/100 · {CONFIDENCE_LABELS[l.confidence]}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
