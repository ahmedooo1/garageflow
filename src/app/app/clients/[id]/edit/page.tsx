import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customer-form";
import { InlineAction } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { fullName } from "@/lib/format";
import { deleteCustomerAction } from "@/server/actions/customers";
import { assertPermission, requireUser } from "@/server/context";
import { NotFoundError } from "@/server/lib/errors";
import { getCustomer } from "@/server/services/customers";

export const metadata: Metadata = { title: "Modifier le client" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireUser();
  assertPermission(ctx, "customers:write");
  const customer = await getCustomer(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Modifier ${fullName(customer)}`} back={{ href: `/app/clients/${id}`, label: "Fiche client" }} />
      <Card>
        <CustomerForm customer={customer} />
      </Card>
      {customer.workOrders.length === 0 && (
        <Card title="Supprimer le client" className="mt-4">
          <p className="mb-3 text-sm text-muted">Ce client n&apos;a aucun dossier : il peut être supprimé avec ses véhicules. Cette action est définitive.</p>
          <InlineAction action={deleteCustomerAction} hidden={{ id: customer.id }} variant="danger" confirm={`Supprimer ${fullName(customer)} et ses véhicules ?`}>
            Supprimer le client
          </InlineAction>
        </Card>
      )}
    </div>
  );
}
