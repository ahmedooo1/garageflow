import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
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

      <Card title="Vos données" className="mt-4">
        <p className="text-sm text-ink-2">
          Téléchargez l&apos;intégralité des données de votre garage au format JSON : clients, véhicules, dossiers, diagnostics, estimations et
          décisions clients. L&apos;export reste disponible même après la fin de votre abonnement.
        </p>
        <a href="/api/export" className="btn btn-dark mt-4" download>
          <Download className="h-4 w-4" />
          Exporter mes données
        </a>
        <p className="mt-4 text-xs text-muted">
          Consultez les <Link href="/cgu" className="font-semibold underline">conditions d&apos;utilisation</Link> et la{" "}
          <Link href="/confidentialite" className="font-semibold underline">politique de confidentialité</Link>.
        </p>
      </Card>
    </div>
  );
}
