import { Card, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { TIMELINE_LABELS } from "@/lib/labels";
import type { WorkOrderDetail } from "@/server/services/workorders";

const DOT: Record<string, string> = {
  WORK_ORDER_CREATED: "bg-steel-800",
  CUSTOMER_DECISION: "bg-ok",
  ESTIMATE_SENT: "bg-warn",
  VEHICLE_READY: "bg-ok",
  VEHICLE_DELIVERED: "bg-ok",
  WORK_ORDER_CLOSED: "bg-steel-600",
  WORK_ORDER_CANCELLED: "bg-danger",
  PHOTO_ADDED: "bg-info",
  FINDING_ADDED: "bg-accent",
};

export function TimelineTab({ events }: { events: WorkOrderDetail["events"] }) {
  return (
    <Card title={`Timeline (${events.length})`}>
      {events.length === 0 ? (
        <EmptyState title="Aucun événement" />
      ) : (
        <ol className="relative border-l-2 border-line pl-5" data-testid="timeline">
          {events.map((e) => (
            <li key={e.id} className="relative pb-5 last:pb-0">
              <span className={`absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-surface ${DOT[e.type] ?? "bg-line-strong"}`} aria-hidden />
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                {TIMELINE_LABELS[e.type] ?? e.type} · {formatDateTime(e.createdAt)} · {e.actor ? `${e.actor.firstName} ${e.actor.lastName}` : e.actorLabel || "Système"}
              </p>
              <p className="mt-0.5 text-sm text-ink">{e.message}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
