import Link from "next/link";
import { UrgencyBadge } from "@/components/status-badge";
import { Card, EmptyState, KV, Plate } from "@/components/ui";
import { formatDateTime, formatKm, fullName } from "@/lib/format";
import { ESTIMATE_STATUS_LABELS, FUEL_LABELS } from "@/lib/labels";
import { formatEur } from "@/lib/pricing";
import type { PhotoView } from "@/server/services/photos";
import type { WorkOrderDetail } from "@/server/services/workorders";
import type { EstimateView, FindingView } from "../view-model";

export function OverviewTab({ wo, photos, estimates, findings }: { wo: WorkOrderDetail; photos: PhotoView[]; estimates: EstimateView[]; findings: FindingView[] }) {
  const current = estimates[0];
  const base = `/app/dossiers/${wo.id}`;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Réception" className="lg:col-span-2">
        <KV
          items={[
            { label: "Réceptionné le", value: formatDateTime(wo.createdAt) },
            { label: "Par", value: fullName(wo.createdBy) },
            { label: "Kilométrage entrée", value: formatKm(wo.mileageIn) },
            { label: "Restitution prévue", value: formatDateTime(wo.promisedAt) },
            { label: "Technicien", value: wo.technician ? fullName(wo.technician) : "Non assigné" },
            { label: "Kilométrage sortie", value: wo.mileageOut ? formatKm(wo.mileageOut) : "-" },
          ]}
        />
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="font-bold">Raison de la visite :</span> {wo.reason}
          </p>
          {wo.symptoms && (
            <p className="whitespace-pre-line">
              <span className="font-bold">Symptômes :</span> {wo.symptoms}
            </p>
          )}
        </div>
      </Card>

      <Card title="Véhicule">
        <div className="mb-3">
          <Plate plate={wo.vehicle.plate} />
        </div>
        <KV
          items={[
            { label: "Modèle", value: `${wo.vehicle.make} ${wo.vehicle.model}` },
            { label: "Année", value: wo.vehicle.year ?? "-" },
            { label: "Carburant", value: FUEL_LABELS[wo.vehicle.fuel] },
            { label: "VIN", value: wo.vehicle.vin ? <span className="font-mono text-sm">{wo.vehicle.vin}</span> : "-" },
          ]}
        />
        <Link href={`/app/vehicules/${wo.vehicle.id}`} className="btn btn-secondary btn-sm mt-4">
          Fiche & historique véhicule
        </Link>
      </Card>

      <Card title={`Photos (${photos.length})`} actions={<Link href={`${base}?tab=photos`} className="btn btn-ghost btn-sm">Gérer</Link>}>
        {photos.length === 0 ? (
          <EmptyState title="Aucune photo" action={<Link href={`${base}?tab=photos`} className="btn btn-primary btn-sm">Ajouter des photos</Link>} />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.slice(0, 6).map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.comment} className="aspect-[4/3] w-full rounded-md object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Diagnostic (${findings.length})`} actions={<Link href={`${base}?tab=diagnosis`} className="btn btn-ghost btn-sm">Gérer</Link>}>
        {findings.length === 0 ? (
          <EmptyState title="Aucun constat" action={<Link href={`${base}?tab=diagnosis`} className="btn btn-primary btn-sm">Ajouter un constat</Link>} />
        ) : (
          <ul className="divide-y divide-line">
            {findings.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{f.title}</span>
                  <span className="text-xs text-muted">{f.category}</span>
                </span>
                <UrgencyBadge urgency={f.urgency} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={current ? `Travaux · estimation v${current.version}` : "Travaux"} actions={<Link href={`${base}?tab=estimate`} className="btn btn-ghost btn-sm">Gérer</Link>}>
        {!current ? (
          <EmptyState title="Aucune proposition" action={<Link href={`${base}?tab=estimate`} className="btn btn-primary btn-sm">Proposer des travaux</Link>} />
        ) : (
          <>
            <p className="mb-2 text-sm font-semibold text-muted">{ESTIMATE_STATUS_LABELS[current.status]}</p>
            <ul className="divide-y divide-line text-sm">
              {current.lines.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className={l.decision === "REFUSED" ? "text-muted line-through" : ""}>{l.title}</span>
                  <span className="font-semibold">{formatEur(l.totalTtc)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-right font-extrabold">
              {current.status === "DECIDED" ? `Accepté : ${formatEur(current.totals.acceptedTtc)}` : `Total : ${formatEur(current.totals.totalTtc)}`} TTC
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
