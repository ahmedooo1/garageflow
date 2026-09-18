import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { SearchForm } from "@/components/search-form";
import { EmptyState, PageHeader } from "@/components/ui";
import { hasPermission } from "@/lib/rbac";
import { requireUser } from "@/server/context";
import { searchCustomers } from "@/server/services/customers";

export const metadata: Metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { ctx, user } = await requireUser();
  const customers = await searchCustomers(ctx, q ?? "");
  const canWrite = hasPermission(user.role, "customers:write");

  return (
    <>
      <PageHeader
        title="Clients"
        actions={
          canWrite ? (
            <Link href="/app/clients/new" className="btn btn-primary">
              <Plus className="h-5 w-5" /> Nouveau client
            </Link>
          ) : null
        }
      />
      <SearchForm q={q} placeholder="Nom, téléphone, email, plaque…" />
      {customers.length === 0 ? (
        <EmptyState title="Aucun client" description={q ? "Aucun résultat pour cette recherche." : "Ajoutez votre premier client."} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {customers.map((c) => (
            <li key={c.id}>
              <Link href={`/app/clients/${c.id}`} className="card block p-4 hover:border-steel-300 hover:shadow-md">
                <p className="text-lg font-bold text-ink">
                  {c.lastName.toUpperCase()} {c.firstName}
                </p>
                <p className="text-sm text-ink-2">{c.phone || <span className="text-muted">Pas de téléphone</span>}</p>
                {c.email && <p className="truncate text-sm text-muted">{c.email}</p>}
                <p className="mt-2 text-xs font-semibold text-muted">
                  {c._count.vehicles} véhicule{c._count.vehicles > 1 ? "s" : ""} · {c._count.workOrders} dossier{c._count.workOrders > 1 ? "s" : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
