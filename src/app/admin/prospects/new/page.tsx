import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { CSV_COLUMNS, MAX_IMPORT_ROWS } from "@/server/growth/csv";
import { ImportForm, ManualLeadForm } from "./forms";

export const metadata: Metadata = { title: "Ajouter des prospects", robots: { index: false, follow: false } };

export default function NewProspectPage() {
  return (
    <>
      <PageHeader title="Ajouter des prospects" back={{ href: "/admin/prospects", label: "Prospects" }} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Un garage à la main">
          <p className="mb-4 text-sm text-muted">
            Indiquez la page où vous avez trouvé ce garage (fiche annuaire-entreprises, site du garage, page Pages Jaunes…). Sans source, l&apos;ajout est
            refusé.
          </p>
          <ManualLeadForm />
        </Card>
        <Card title="Import CSV">
          <p className="mb-2 text-sm text-muted">
            Colonnes reconnues : <code className="text-xs">{CSV_COLUMNS.join(";")}</code>. Obligatoires : <code>nom</code> et <code>source_url</code>.{" "}
            {MAX_IMPORT_ROWS} lignes au plus. Les doublons complètent les fiches existantes sans rien écraser ; les garages en opposition sont ignorés.
          </p>
          <ImportForm />
        </Card>
      </div>
    </>
  );
}
