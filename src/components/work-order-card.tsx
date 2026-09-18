import { Clock, User, Wrench } from "lucide-react";
import Link from "next/link";
import { formatShort, fullName } from "@/lib/format";
import type { WorkOrderCard as WorkOrderCardData } from "@/server/services/workorders";
import { StatusBadge } from "./status-badge";
import { Plate } from "./ui";

export function WorkOrderCard({ wo, compact, now }: { wo: WorkOrderCardData; compact?: boolean; now: number }) {
  const late = wo.promisedAt && wo.promisedAt.getTime() < now && !["READY_FOR_PICKUP", "DELIVERED", "CLOSED", "CANCELLED"].includes(wo.status);
  return (
    <Link
      href={`/app/dossiers/${wo.id}`}
      className="card block p-3 transition hover:border-steel-300 hover:shadow-md active:translate-y-px"
      data-testid="work-order-card"
    >
      <div className="flex items-start justify-between gap-2">
        <Plate plate={wo.vehicle.plate} />
        <span className="text-xs font-semibold text-muted">{wo.number}</span>
      </div>
      <p className="mt-2 truncate font-bold text-ink">
        {wo.vehicle.make} {wo.vehicle.model}
      </p>
      <p className="flex items-center gap-1.5 truncate text-sm text-ink-2">
        <User className="h-3.5 w-3.5 shrink-0 text-muted" />
        {fullName(wo.customer)}
      </p>
      {!compact && <p className="mt-1 line-clamp-1 text-sm text-muted">{wo.reason}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted">
        <span className="inline-flex items-center gap-1">
          <Wrench className="h-3.5 w-3.5" />
          {wo.technician ? fullName(wo.technician) : "Non assigné"}
        </span>
        <span className={`inline-flex items-center gap-1 ${late ? "text-danger font-bold" : ""}`}>
          <Clock className="h-3.5 w-3.5" />
          {wo.promisedAt ? formatShort(wo.promisedAt) : "—"}
        </span>
      </div>
      <div className="mt-2">
        <StatusBadge status={wo.status} />
      </div>
    </Link>
  );
}
