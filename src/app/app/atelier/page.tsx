import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { WorkOrderCard } from "@/components/work-order-card";
import { PageHeader } from "@/components/ui";
import { nowMs } from "@/lib/format";
import { KANBAN_COLUMNS } from "@/lib/labels";
import { hasPermission } from "@/lib/rbac";
import { requireUser } from "@/server/context";
import { listActiveWorkOrders } from "@/server/services/workorders";

export const metadata: Metadata = { title: "Atelier" };
export const dynamic = "force-dynamic";

export default async function AtelierPage() {
  const { ctx, user } = await requireUser();
  const orders = await listActiveWorkOrders(ctx);
  const now = nowMs();
  const columns = KANBAN_COLUMNS.map((col) => ({ ...col, orders: orders.filter((o) => col.statuses.includes(o.status)) }));

  return (
    <>
      <PageHeader
        title="Atelier"
        subtitle={`${orders.length} véhicule${orders.length > 1 ? "s" : ""} en cours`}
        actions={
          hasPermission(user.role, "workorders:create") ? (
            <Link href="/app/dossiers/new" className="btn btn-primary">
              <Plus className="h-5 w-5" /> Nouvelle réception
            </Link>
          ) : null
        }
      />
      <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="grid min-w-[1400px] grid-cols-8 gap-3">
          {columns.map((col) => (
            <section key={col.key} className="flex min-h-[60vh] flex-col rounded-[12px] bg-steel-800/5 p-2" data-testid={`kanban-${col.key}`}>
              <header className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">{col.label}</h2>
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-steel-800 px-1.5 text-xs font-bold text-white">{col.orders.length}</span>
              </header>
              <div className="flex flex-col gap-2">
                {col.orders.map((wo) => (
                  <WorkOrderCard key={wo.id} wo={wo} compact now={now} />
                ))}
                {col.orders.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted">Aucun véhicule</p>}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
