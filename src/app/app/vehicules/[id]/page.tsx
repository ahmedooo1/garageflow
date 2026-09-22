import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card, EmptyState, KV, PageHeader, Plate } from "@/components/ui";
import { formatDateTime, formatKm, fullName } from "@/lib/format";
import { FUEL_LABELS } from "@/lib/labels";
import { formatEur } from "@/lib/pricing";
import { hasPermission } from "@/lib/rbac";
import { requireUser } from "@/server/context";
import { NotFoundError } from "@/server/lib/errors";
import { getVehicle } from "@/server/services/vehicles";

export const metadata: Metadata = { title: "Véhicule" };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, user } = await requireUser();
  const vehicle = await getVehicle(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const openOrder = vehicle.workOrders.find((wo) => !["CLOSED", "CANCELLED"].includes(wo.status));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Plate plate={vehicle.plate} />
            {vehicle.make} {vehicle.model}
          </span>
        }
        subtitle={
          <>
            Client :{" "}
            <Link href={`/app/clients/${vehicle.customer.id}`} className="font-semibold text-accent hover:underline">
              {fullName(vehicle.customer)}
            </Link>
          </>
        }
        back={{ href: "/app/vehicules", label: "Véhicules" }}
        actions={
          <>
            {hasPermission(user.role, "workorders:create") &&
              (openOrder ? (
                <Link href={`/app/dossiers/${openOrder.id}`} className="btn btn-secondary">
                  Dossier en cours : {openOrder.number}
                </Link>
              ) : (
                <Link href={`/app/dossiers/new?customerId=${vehicle.customerId}&vehicleId=${vehicle.id}`} className="btn btn-primary">
                  <Plus className="h-5 w-5" /> Réceptionner
                </Link>
              ))}
            {hasPermission(user.role, "vehicles:write") && (
              <Link href={`/app/vehicules/${vehicle.id}/edit`} className="btn btn-dark">
                <Pencil className="h-4 w-4" /> Modifier
              </Link>
            )}
          </>
        }
      />
      <div className="grid gap-4">
        <Card title="Identité du véhicule">
          <KV
            items={[
              { label: "Immatriculation", value: <Plate plate={vehicle.plate} /> },
              { label: "VIN", value: vehicle.vin ? <span className="font-mono">{vehicle.vin}</span> : "-" },
              { label: "Année", value: vehicle.year ?? "-" },
              { label: "Carburant", value: FUEL_LABELS[vehicle.fuel] },
              { label: "Kilométrage", value: formatKm(vehicle.mileage) },
              { label: "Couleur", value: vehicle.color || "-" },
            ]}
          />
          {vehicle.notes && <p className="mt-4 whitespace-pre-line rounded-[10px] bg-surface-2 p-3 text-sm">{vehicle.notes}</p>}
        </Card>
        <Card title={`Historique complet (${vehicle.workOrders.length} intervention${vehicle.workOrders.length > 1 ? "s" : ""})`}>
          {vehicle.workOrders.length === 0 ? (
            <EmptyState title="Aucune intervention pour ce véhicule" />
          ) : (
            <ul className="divide-y divide-line" data-testid="vehicle-history">
              {vehicle.workOrders.map((wo) => {
                const decided = wo.estimates.find((e) => e.status === "DECIDED");
                const accepted = decided?.lines.filter((l) => l.decision === "ACCEPTED") ?? [];
                const refused = decided?.lines.filter((l) => l.decision === "REFUSED") ?? [];
                return (
                  <li key={wo.id} className="py-4">
                    <Link href={`/app/dossiers/${wo.id}`} className="flex flex-wrap items-center gap-3 hover:text-accent">
                      <span className="font-bold">{wo.number}</span>
                      <span className="text-sm text-muted">{formatDateTime(wo.createdAt)}</span>
                      <span className="text-sm text-muted">{formatKm(wo.mileageIn)}</span>
                      <StatusBadge status={wo.status} />
                      <span className="text-sm text-muted">{wo.technician ? `Tech. ${fullName(wo.technician)}` : ""}</span>
                    </Link>
                    <p className="mt-1 text-sm text-ink">{wo.reason}</p>
                    {decided && (
                      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-ok">Travaux acceptés</p>
                          {accepted.length === 0 ? (
                            <p className="text-muted">Aucun</p>
                          ) : (
                            <ul className="list-disc pl-5">
                              {accepted.map((l) => (
                                <li key={l.id}>
                                  {l.title} · {formatEur(l.totalTtc.toString())}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-danger">Travaux refusés</p>
                          {refused.length === 0 ? (
                            <p className="text-muted">Aucun</p>
                          ) : (
                            <ul className="list-disc pl-5">
                              {refused.map((l) => (
                                <li key={l.id}>
                                  {l.title} · {formatEur(l.totalTtc.toString())}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {decided.approval && (
                          <p className="font-semibold sm:col-span-2">Montant accepté : {formatEur(decided.approval.acceptedTotal.toString())} TTC</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
