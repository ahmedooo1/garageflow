import type { Role } from "@prisma/client";
import Link from "next/link";
import { Alert, Card, EmptyState, KV } from "@/components/ui";
import { formatDateTime, formatKm, fullName } from "@/lib/format";
import { TIMELINE_LABELS } from "@/lib/labels";
import { formatEur } from "@/lib/pricing";
import { hasPermission } from "@/lib/rbac";
import type { WorkOrderDetail } from "@/server/services/workorders";
import type { EstimateView } from "../view-model";
import { CloseButton, DeliverForm, FinalCheckForm, MarkReadyButton } from "./delivery-forms";

export function DeliveryTab({ wo, estimates, role }: { wo: WorkOrderDetail; estimates: EstimateView[]; role: Role }) {
  const decided = estimates.find((e) => e.status === "DECIDED");
  const accepted = decided?.lines.filter((l) => l.decision === "ACCEPTED") ?? [];
  const refused = decided?.lines.filter((l) => l.decision === "REFUSED") ?? [];
  const canTransition = hasPermission(role, "repair:transition");
  const canDeliver = hasPermission(role, "workorders:deliver");
  const canClose = hasPermission(role, "workorders:close");
  const keyEvents = wo.events.filter((e) => ["WORK_ORDER_CREATED", "ESTIMATE_SENT", "CUSTOMER_DECISION", "VEHICLE_READY", "VEHICLE_DELIVERED", "WORK_ORDER_CLOSED", "STATUS_CHANGED"].includes(e.type));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid gap-4 lg:col-span-2">
        {wo.status === "QUALITY_CONTROL" && (
          <Card title="Contrôle final">
            <FinalCheckForm workOrderId={wo.id} check={wo.finalCheck} canEdit={canTransition} />
            {wo.finalCheck && canTransition && (
              <div className="mt-4 border-t border-line pt-4">
                <MarkReadyButton workOrderId={wo.id} />
              </div>
            )}
          </Card>
        )}

        {wo.status === "READY_FOR_PICKUP" && (
          <Card title="Restituer le véhicule">
            <Alert tone="ok" className="mb-4">
              Véhicule prêt. Vérifiez le récapitulatif avec le client puis enregistrez la restitution.
            </Alert>
            {canDeliver ? <DeliverForm workOrderId={wo.id} mileageIn={wo.mileageIn} /> : <p className="text-sm text-muted">La restitution est enregistrée par la réception.</p>}
          </Card>
        )}

        {wo.status === "DELIVERED" && (
          <Card title="Véhicule restitué">
            <Alert tone="ok" className="mb-4">
              Restitué le {formatDateTime(wo.deliveredAt)} à {formatKm(wo.mileageOut)}. Clôturez le dossier pour l&apos;archiver dans l&apos;historique.
            </Alert>
            {canClose && <CloseButton workOrderId={wo.id} />}
          </Card>
        )}

        {wo.status === "CLOSED" && (
          <Alert tone="info">
            Dossier clôturé le {formatDateTime(wo.closedAt)}. Consultez l&apos;historique complet sur la{" "}
            <Link href={`/app/vehicules/${wo.vehicle.id}`} className="font-bold underline">
              fiche véhicule
            </Link>
            .
          </Alert>
        )}

        {!["QUALITY_CONTROL", "READY_FOR_PICKUP", "DELIVERED", "CLOSED"].includes(wo.status) && (
          <Card title="Restitution">
            <EmptyState title="Pas encore à cette étape" description="Le contrôle final puis la restitution deviennent disponibles une fois la réparation terminée." />
          </Card>
        )}

        <Card title="Récapitulatif pour le client">
          <KV
            items={[
              { label: "Client", value: fullName(wo.customer) },
              { label: "Kilométrage entrée", value: formatKm(wo.mileageIn) },
              { label: "Kilométrage sortie", value: wo.mileageOut ? formatKm(wo.mileageOut) : "—" },
            ]}
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-ok">Travaux réalisés / acceptés</h3>
              {accepted.length === 0 ? (
                <p className="text-sm text-muted">Aucun</p>
              ) : (
                <ul className="divide-y divide-line text-sm" data-testid="works-done">
                  {accepted.map((l) => (
                    <li key={l.id} className="flex justify-between py-1.5">
                      <span>
                        {l.title}
                        {l.workStatus === "DONE" && <span className="ml-1 text-xs font-bold text-ok">✓</span>}
                      </span>
                      <span className="font-semibold">{formatEur(l.totalTtc)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-danger">Travaux refusés</h3>
              {refused.length === 0 ? (
                <p className="text-sm text-muted">Aucun</p>
              ) : (
                <ul className="divide-y divide-line text-sm" data-testid="works-refused">
                  {refused.map((l) => (
                    <li key={l.id} className="flex justify-between py-1.5 text-muted">
                      <span>{l.title}</span>
                      <span>{formatEur(l.totalTtc)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="mt-4 text-right text-xl font-extrabold" data-testid="final-amount">
            Montant final : {formatEur(decided?.totals.acceptedTtc ?? "0")} TTC
          </p>
        </Card>
      </div>

      <Card title="Historique du dossier">
        <ol className="space-y-3 text-sm">
          {keyEvents.map((e) => (
            <li key={e.id}>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                {TIMELINE_LABELS[e.type] ?? e.type} · {formatDateTime(e.createdAt)}
              </p>
              <p>{e.message}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
