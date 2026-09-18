import type { Metadata } from "next";
import type { WorkOrderStatus } from "@prisma/client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { SearchForm } from "@/components/search-form";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState, PageHeader, Plate } from "@/components/ui";
import { formatDateTime, fullName } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/labels";
import { hasPermission } from "@/lib/rbac";
import { requireUser } from "@/server/context";
import { listWorkOrders } from "@/server/services/workorders";

export const metadata: Metadata = { title: "Dossiers" };
export const dynamic = "force-dynamic";

const STATUS_KEYS = Object.keys(STATUS_LABELS) as WorkOrderStatus[];

export default async function DossiersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const { ctx, user } = await requireUser();
  const status = (sp.status && (STATUS_KEYS as string[]).includes(sp.status) ? sp.status : sp.status === "ALL" ? "ALL" : "ACTIVE") as WorkOrderStatus | "ALL" | "ACTIVE";
  const orders = await listWorkOrders(ctx, { q: sp.q, status });

  return (
    <>
      <PageHeader
        title="Dossiers d'intervention"
        actions={
          hasPermission(user.role, "workorders:create") ? (
            <Link href="/app/dossiers/new" className="btn btn-primary">
              <Plus className="h-5 w-5" /> Nouvelle réception
            </Link>
          ) : null
        }
      />
      <SearchForm
        q={sp.q}
        placeholder="N° dossier, plaque, client, modèle…"
        extra={
          <select name="status" defaultValue={status} className="input sm:w-56" aria-label="Filtrer par statut">
            <option value="ACTIVE">En cours</option>
            <option value="ALL">Tous les statuts</option>
            {STATUS_KEYS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        }
      />
      {orders.length === 0 ? (
        <EmptyState title="Aucun dossier" description="Créez une nouvelle réception pour démarrer un dossier d'intervention." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs font-bold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Dossier</th>
                <th className="px-4 py-3">Véhicule</th>
                <th className="hidden px-4 py-3 md:table-cell">Client</th>
                <th className="hidden px-4 py-3 lg:table-cell">Technicien</th>
                <th className="hidden px-4 py-3 lg:table-cell">Promis</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((wo) => (
                <tr key={wo.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/app/dossiers/${wo.id}`} className="font-bold text-ink hover:text-accent">
                      {wo.number}
                    </Link>
                    <p className="text-xs text-muted">{formatDateTime(wo.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/app/dossiers/${wo.id}`} className="block">
                      <Plate plate={wo.vehicle.plate} className="text-xs" />
                      <p className="mt-1 font-medium">
                        {wo.vehicle.make} {wo.vehicle.model}
                      </p>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{fullName(wo.customer)}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">{wo.technician ? fullName(wo.technician) : <span className="text-muted">—</span>}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">{formatDateTime(wo.promisedAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={wo.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
