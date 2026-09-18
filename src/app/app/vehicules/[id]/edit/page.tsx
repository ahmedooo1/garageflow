import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VehicleForm } from "@/components/vehicle-form";
import { Card, PageHeader } from "@/components/ui";
import { assertPermission, requireUser } from "@/server/context";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/lib/errors";
import { getVehicle } from "@/server/services/vehicles";

export const metadata: Metadata = { title: "Modifier le véhicule" };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireUser();
  assertPermission(ctx, "vehicles:write");
  const vehicle = await getVehicle(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const customers = await prisma.customer.findMany({
    where: { garageId: ctx.garageId },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Modifier ${vehicle.make} ${vehicle.model}`} back={{ href: `/app/vehicules/${id}`, label: "Fiche véhicule" }} />
      <Card>
        <VehicleForm vehicle={vehicle} customers={customers} />
      </Card>
    </div>
  );
}
