import type { Metadata } from "next";
import { CustomerForm } from "@/components/customer-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/context";
import { assertPermission } from "@/server/context";

export const metadata: Metadata = { title: "Nouveau client" };

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { ctx } = await requireUser();
  assertPermission(ctx, "customers:write");
  const { returnTo } = await searchParams;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nouveau client" back={{ href: returnTo?.startsWith("/app/") ? returnTo : "/app/clients", label: "Retour" }} />
      <Card>
        <CustomerForm returnTo={returnTo} />
      </Card>
    </div>
  );
}
