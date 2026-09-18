import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { assertPermission, requireUser } from "@/server/context";
import { getGarage } from "@/server/services/users";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { ctx } = await requireUser();
  assertPermission(ctx, "garage:settings");
  const garage = await getGarage(ctx);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Paramètres du garage" subtitle="Ces informations apparaissent sur le portail de validation envoyé aux clients." />
      <Card>
        <SettingsForm garage={{ name: garage.name, address: garage.address, phone: garage.phone, email: garage.email, siret: garage.siret, vatRate: garage.vatRate.toString() }} />
      </Card>
    </div>
  );
}
