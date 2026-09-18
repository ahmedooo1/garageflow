import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { assertPermission, requireUser } from "@/server/context";
import { prisma } from "@/server/db";
import { listTechnicians } from "@/server/services/users";
import { ReceptionForm } from "./reception-form";

export const metadata: Metadata = { title: "Nouvelle réception" };
export const dynamic = "force-dynamic";

export default async function NewWorkOrderPage({ searchParams }: { searchParams: Promise<{ customerId?: string; vehicleId?: string }> }) {
  const { ctx } = await requireUser();
  assertPermission(ctx, "workorders:create");
  const sp = await searchParams;
  const [customers, vehicles, technicians] = await Promise.all([
    prisma.customer.findMany({ where: { garageId: ctx.garageId }, select: { id: true, firstName: true, lastName: true, phone: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.vehicle.findMany({ where: { garageId: ctx.garageId }, select: { id: true, customerId: true, plate: true, make: true, model: true, mileage: true }, orderBy: { plate: "asc" } }),
    listTechnicians(ctx),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nouvelle réception" subtitle="Client → véhicule → motif de la visite. Les photos s'ajoutent juste après." back={{ href: "/app/atelier", label: "Atelier" }} />
      <ReceptionForm customers={customers} vehicles={vehicles} technicians={technicians} initialCustomerId={sp.customerId} initialVehicleId={sp.vehicleId} />
    </div>
  );
}
