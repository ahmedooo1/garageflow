import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Hourglass, Plus, Wrench } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BoardCard } from "@/components/board-card";
import { formatDate, nowMs } from "@/lib/format";
import { KANBAN_COLUMNS } from "@/lib/labels";
import { hasPermission } from "@/lib/rbac";
import { requireUser } from "@/server/context";
import { listTechnicians } from "@/server/services/users";
import { listActiveWorkOrders } from "@/server/services/workorders";

export const metadata: Metadata = { title: "Atelier" };
export const dynamic = "force-dynamic";

/** Couleur d'accent de chaque couloir (haut de colonne). */
const LANE_ACCENT: Record<string, string> = {
  "to-diagnose": "bg-steel-300",
  diagnosis: "bg-info",
  "waiting-customer": "bg-warn",
  "waiting-parts": "bg-accent",
  "to-repair": "bg-ok",
  repairing: "bg-info",
  quality: "bg-violet",
  ready: "bg-ok",
};

export default async function AtelierPage({ searchParams }: { searchParams: Promise<{ tech?: string }> }) {
  const { tech } = await searchParams;
  const { ctx, user } = await requireUser();
  const [allOrders, technicians] = await Promise.all([listActiveWorkOrders(ctx), listTechnicians(ctx)]);
  const now = nowMs();
  const orders = tech === "none" ? allOrders.filter((o) => !o.technicianId) : tech ? allOrders.filter((o) => o.technicianId === tech) : allOrders;
  const columns = KANBAN_COLUMNS.map((col) => ({ ...col, orders: orders.filter((o) => col.statuses.includes(o.status)) }));
  const late = allOrders.filter((o) => o.promisedAt && o.promisedAt.getTime() < now && o.status !== "READY_FOR_PICKUP").length;
  const ready = allOrders.filter((o) => o.status === "READY_FOR_PICKUP").length;
  const waitingCustomer = allOrders.filter((o) => o.status === "WAITING_CUSTOMER_APPROVAL").length;
  const assignedTechs = technicians.filter((t) => allOrders.some((o) => o.technicianId === t.id));
  const canCreate = hasPermission(user.role, "workorders:create");

  return (
    <div className="-mx-4 -mb-24 -mt-5 flex min-h-[calc(100dvh-3.5rem)] flex-col bg-steel-900 text-white sm:-mx-6 lg:-mx-8 lg:-mb-8 lg:min-h-dvh">
      <AutoRefresh seconds={60} />

      {/* Bandeau de tête : titre, date, indicateurs, action principale */}
      <header className="border-b border-steel-700 px-4 pb-4 pt-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-steel-300">
              {user.garageName} · {formatDate(new Date(now))}
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Atelier</h1>
          </div>
          {canCreate && (
            <Link href="/app/dossiers/new" className="btn btn-primary btn-lg shadow-lg shadow-accent/30">
              <Plus className="h-5 w-5" /> Nouvelle réception
            </Link>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <Kpi icon={Wrench} label="Véhicules en cours" value={allOrders.length} tone="neutral" />
          <Kpi icon={AlertTriangle} label="En retard" value={late} tone={late > 0 ? "danger" : "neutral"} />
          <Kpi icon={Hourglass} label="Attente client" value={waitingCustomer} tone={waitingCustomer > 0 ? "warn" : "neutral"} />
          <Kpi icon={CheckCircle2} label="Prêts à restituer" value={ready} tone={ready > 0 ? "ok" : "neutral"} />
        </div>

        {assignedTechs.length > 0 && (
          <div className="scrollbar-thin mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrer par technicien">
            <FilterChip href="/app/atelier" active={!tech} label="Tous" count={allOrders.length} />
            {assignedTechs.map((t) => (
              <FilterChip key={t.id} href={`/app/atelier?tech=${t.id}`} active={tech === t.id} label={`${t.firstName} ${t.lastName}`} count={allOrders.filter((o) => o.technicianId === t.id).length} />
            ))}
            <FilterChip href="/app/atelier?tech=none" active={tech === "none"} label="Non assignés" count={allOrders.filter((o) => !o.technicianId).length} />
          </div>
        )}
      </header>

      {/* Tableau : un couloir par étape, défilement horizontal avec accroche */}
      <div className="scrollbar-thin flex-1 overflow-x-auto overscroll-x-contain px-4 py-4 sm:px-6 lg:px-8" style={{ scrollSnapType: "x mandatory" }}>
        <div className="grid h-full grid-cols-8 gap-3" style={{ minWidth: 1920 }}>
          {columns.map((col, index) => (
            <section key={col.key} className="flex min-h-[60vh] flex-col rounded-[16px] bg-steel-800/80" data-testid={`kanban-${col.key}`} style={{ scrollSnapAlign: "start" }}>
              <header className="relative px-3 pb-2 pt-3">
                <span className={`absolute inset-x-3 top-0 h-1 rounded-b-full ${LANE_ACCENT[col.key]}`} aria-hidden />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-white">
                    <span className="mr-1.5 text-steel-300">{index + 1}</span>
                    {col.label}
                  </h2>
                  <span className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-sm font-extrabold ${col.orders.length > 0 ? "bg-white text-steel-900" : "bg-steel-700 text-steel-300"}`}>
                    {col.orders.length}
                  </span>
                </div>
              </header>
              <div className="flex flex-1 flex-col gap-3 px-2 pb-2">
                {col.orders.map((wo) => (
                  <BoardCard key={wo.id} wo={wo} now={now} />
                ))}
                {col.orders.length === 0 && (
                  <div className="grid flex-1 place-items-center rounded-[12px] border border-dashed border-steel-600 py-10 text-xs font-semibold text-steel-300">Aucun véhicule</div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: "neutral" | "danger" | "warn" | "ok" }) {
  const tones = {
    neutral: "bg-steel-800 text-white",
    danger: "bg-danger text-white",
    warn: "bg-warn text-white",
    ok: "bg-ok text-white",
  };
  return (
    <div className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 ${tones[tone]}`}>
      <Icon className="h-6 w-6 shrink-0 opacity-90" />
      <div className="min-w-0">
        <p className="text-2xl font-extrabold leading-none">{value}</p>
        <p className="truncate text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      </div>
    </div>
  );
}

function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-bold transition ${active ? "border-accent bg-accent text-white" : "border-steel-600 bg-steel-800 text-steel-300 hover:border-steel-300 hover:text-white"}`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/20" : "bg-steel-700"}`}>{count}</span>
    </Link>
  );
}
