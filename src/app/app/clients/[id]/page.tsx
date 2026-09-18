import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card, EmptyState, KV, PageHeader, Plate } from "@/components/ui";
import { formatDateTime, formatKm, fullName } from "@/lib/format";
import { FUEL_LABELS } from "@/lib/labels";
import { hasPermission } from "@/lib/rbac";
import { requireUser } from "@/server/context";
import { NotFoundError } from "@/server/lib/errors";
import { getCustomer } from "@/server/services/customers";

export const metadata: Metadata = { title: "Client" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, user } = await requireUser();
  const customer = await getCustomer(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const canWrite = hasPermission(user.role, "customers:write");
  const canVehicle = hasPermission(user.role, "vehicles:write");

  return (
    <>
      <PageHeader
        title={fullName(customer)}
        subtitle={`Client depuis le ${formatDateTime(customer.createdAt)}`}
        back={{ href: "/app/clients", label: "Clients" }}
        actions={
          <>
            {canVehicle && (
              <Link href={`/app/vehicules/new?customerId=${customer.id}`} className="btn btn-secondary">
                <Plus className="h-5 w-5" /> Véhicule
              </Link>
            )}
            {canWrite && (
              <Link href={`/app/clients/${customer.id}/edit`} className="btn btn-dark">
                <Pencil className="h-4 w-4" /> Modifier
              </Link>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Coordonnées" className="lg:col-span-1">
          <KV
            items={[
              { label: "Téléphone", value: customer.phone ? <a href={`tel:${customer.phone}`} className="font-semibold text-accent">{customer.phone}</a> : "—" },
              { label: "Email", value: customer.email ? <a href={`mailto:${customer.email}`} className="break-all text-accent">{customer.email}</a> : "—" },
              { label: "Adresse", value: customer.address || "—" },
            ]}
          />
          {customer.notes && (
            <div className="mt-4 rounded-[10px] bg-warn-soft p-3 text-sm text-ink">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-warn">Notes</p>
              <p className="whitespace-pre-line">{customer.notes}</p>
            </div>
          )}
        </Card>
        <Card title={`Véhicules (${customer.vehicles.length})`} className="lg:col-span-2">
          {customer.vehicles.length === 0 ? (
            <EmptyState title="Aucun véhicule" action={canVehicle ? <Link href={`/app/vehicules/new?customerId=${customer.id}`} className="btn btn-primary btn-sm">Ajouter un véhicule</Link> : undefined} />
          ) : (
            <ul className="divide-y divide-line">
              {customer.vehicles.map((v) => (
                <li key={v.id}>
                  <Link href={`/app/vehicules/${v.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-surface-2">
                    <Plate plate={v.plate} />
                    <span className="font-bold">
                      {v.make} {v.model}
                    </span>
                    <span className="text-sm text-muted">
                      {v.year ?? "—"} · {FUEL_LABELS[v.fuel]} · {formatKm(v.mileage)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Historique des interventions (${customer.workOrders.length})`} className="lg:col-span-3">
          {customer.workOrders.length === 0 ? (
            <EmptyState title="Aucune intervention" />
          ) : (
            <ul className="divide-y divide-line">
              {customer.workOrders.map((wo) => (
                <li key={wo.id}>
                  <Link href={`/app/dossiers/${wo.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-surface-2">
                    <span className="w-28 font-bold">{wo.number}</span>
                    <Plate plate={wo.vehicle.plate} className="text-xs" />
                    <span className="min-w-0 flex-1 truncate text-sm">{wo.reason}</span>
                    <span className="text-xs text-muted">{formatDateTime(wo.createdAt)}</span>
                    <StatusBadge status={wo.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
