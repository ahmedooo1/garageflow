import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { SearchForm } from "@/components/search-form";
import { EmptyState, PageHeader, Plate } from "@/components/ui";
import { formatKm } from "@/lib/format";
import { FUEL_LABELS } from "@/lib/labels";
import { hasPermission } from "@/lib/rbac";
import { requireUser } from "@/server/context";
import { searchVehicles } from "@/server/services/vehicles";

export const metadata: Metadata = { title: "Véhicules" };
export const dynamic = "force-dynamic";

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { ctx, user } = await requireUser();
  const vehicles = await searchVehicles(ctx, q ?? "");

  return (
    <>
      <PageHeader
        title="Véhicules"
        actions={
          hasPermission(user.role, "vehicles:write") ? (
            <Link href="/app/vehicules/new" className="btn btn-primary">
              <Plus className="h-5 w-5" /> Nouveau véhicule
            </Link>
          ) : null
        }
      />
      <SearchForm q={q} placeholder="Plaque, VIN, marque, modèle, client…" />
      {vehicles.length === 0 ? (
        <EmptyState title="Aucun véhicule" description={q ? "Aucun résultat pour cette recherche." : "Ajoutez un véhicule à un client."} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((v) => (
            <li key={v.id}>
              <Link href={`/app/vehicules/${v.id}`} className="card block p-4 hover:border-steel-300 hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <Plate plate={v.plate} />
                  <span className="text-xs font-semibold text-muted">
                    {v._count.workOrders} dossier{v._count.workOrders > 1 ? "s" : ""}
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold text-ink">
                  {v.make} {v.model}
                </p>
                <p className="text-sm text-muted">
                  {v.year ?? "-"} · {FUEL_LABELS[v.fuel]} · {formatKm(v.mileage)}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {v.customer.lastName.toUpperCase()} {v.customer.firstName}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
