import type { Metadata } from "next";
import { VehicleForm } from "@/components/vehicle-form";
import { Card, PageHeader } from "@/components/ui";
import { assertPermission, requireUser } from "@/server/context";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Nouveau véhicule" };

export default async function NewVehiclePage({ searchParams }: { searchParams: Promise<{ customerId?: string; returnTo?: string }> }) {
  const { ctx } = await requireUser();
  assertPermission(ctx, "vehicles:write");
  const { customerId, returnTo } = await searchParams;
  const customers = await prisma.customer.findMany({
    where: { garageId: ctx.garageId },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nouveau véhicule" back={{ href: returnTo?.startsWith("/app/") ? returnTo : customerId ? `/app/clients/${customerId}` : "/app/vehicules", label: "Retour" }} />
      <Card>
        <VehicleForm customers={customers} customerId={customerId} returnTo={returnTo} />
      </Card>
    </div>
  );
}
