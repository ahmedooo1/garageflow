import { AlertTriangle, Clock, User } from "lucide-react";
import Link from "next/link";
import { formatShort, fullName } from "@/lib/format";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/labels";
import type { WorkOrderCard as WorkOrderCardData } from "@/server/services/workorders";
import { Plate } from "./ui";

const STRIPE: Record<(typeof STATUS_TONES)[keyof typeof STATUS_TONES], string> = {
  slate: "bg-steel-300",
  blue: "bg-info",
  amber: "bg-warn",
  orange: "bg-accent",
  green: "bg-ok",
  red: "bg-danger",
  purple: "bg-violet",
};

const TEXT: Record<(typeof STATUS_TONES)[keyof typeof STATUS_TONES], string> = {
  slate: "text-steel-600",
  blue: "text-info",
  amber: "text-warn",
  orange: "text-accent",
  green: "text-ok",
  red: "text-danger",
  purple: "text-violet",
};

function initials(p: { firstName: string; lastName: string }): string {
  return `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase();
}

/** Carte du tableau d'atelier : lisible à 2 mètres, tactile, statut et retard très visibles. */
export function BoardCard({ wo, now }: { wo: WorkOrderCardData; now: number }) {
  const tone = STATUS_TONES[wo.status];
  const late = Boolean(wo.promisedAt && wo.promisedAt.getTime() < now && !["READY_FOR_PICKUP", "DELIVERED", "CLOSED", "CANCELLED"].includes(wo.status));
  const soon = Boolean(wo.promisedAt && !late && wo.promisedAt.getTime() - now < 2 * 60 * 60_000);
  return (
    <Link
      href={`/app/dossiers/${wo.id}`}
      data-testid="work-order-card"
      className={`board-card group relative block overflow-hidden rounded-[14px] bg-surface text-ink shadow-lg ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 ${late ? "ring-2 ring-danger" : ""}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${STRIPE[tone]}`} aria-hidden />
      <div className="pl-4 pr-3 pt-3">
        <div className="flex items-start justify-between gap-2">
          <Plate plate={wo.vehicle.plate} className="text-base" />
          <span className="pt-1 text-[11px] font-bold tracking-wide text-muted">{wo.number}</span>
        </div>
        <p className="mt-2 truncate text-lg font-extrabold leading-tight">
          {wo.vehicle.make} {wo.vehicle.model}
        </p>
        <p className="flex items-center gap-1.5 truncate text-sm text-ink-2">
          <User className="h-3.5 w-3.5 shrink-0 text-muted" />
          {fullName(wo.customer)}
        </p>
        <p className="mt-1 line-clamp-1 text-xs text-muted">{wo.reason}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-line bg-surface-2 py-2 pl-4 pr-3">
        <span className="flex min-w-0 items-center gap-1.5 truncate whitespace-nowrap text-xs font-semibold text-ink-2">
          {wo.technician ? (
            <>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-steel-800 text-[10px] font-bold text-white">{initials(wo.technician)}</span>
              <span className="truncate">{wo.technician.firstName}</span>
            </>
          ) : (
            <span className="text-muted">Non assigné</span>
          )}
        </span>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold ${late ? "bg-danger text-white" : soon ? "bg-warn-soft text-warn" : "text-muted"}`}>
          {late ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
          {late ? "Retard" : wo.promisedAt ? formatShort(wo.promisedAt) : "-"}
        </span>
      </div>
      <div className={`px-4 pb-2.5 pt-1 text-[11px] font-extrabold uppercase tracking-wider ${TEXT[tone]} bg-surface-2`}>{STATUS_LABELS[wo.status]}</div>
    </Link>
  );
}
