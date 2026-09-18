"use client";

import type { Role, WorkOrderStatus } from "@prisma/client";
import { Trash2 } from "lucide-react";
import { ActionForm, InlineAction, SubmitButton } from "@/components/forms";
import { PhotoGallery } from "@/components/photo-gallery";
import { PhotoUploader } from "@/components/photo-uploader";
import { Card, EmptyState, Field } from "@/components/ui";
import { CONDITION_PHOTO_TYPES, DAMAGE_TYPE_LABELS, PHOTO_TYPE_LABELS } from "@/lib/labels";
import { hasPermission } from "@/lib/rbac";
import { isTerminal } from "@/lib/state-machine";
import { addDamageAction, deleteDamageAction } from "@/server/actions/workorders";
import type { PhotoView } from "@/server/services/photos";
import type { DamageView } from "../view-model";

export function PhotosTab({ workOrderId, status, photos, damages, role }: { workOrderId: string; status: WorkOrderStatus; photos: PhotoView[]; damages: DamageView[]; role: Role }) {
  const canEdit = hasPermission(role, "diagnosis:write") && !isTerminal(status);
  const conditionPhotos = photos.filter((p) => !p.findingId && !p.damageId && !p.checklistId);
  const missing = (["FRONT", "REAR", "LEFT", "RIGHT", "INTERIOR", "DASHBOARD"] as const).filter((t) => !photos.some((p) => p.type === t));

  return (
    <div className="grid gap-4">
      <Card title="Photos d'état du véhicule">
        {canEdit && (
          <div className="mb-4">
            <PhotoUploader workOrderId={workOrderId} types={CONDITION_PHOTO_TYPES} />
            {missing.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-muted">
                Manquantes : {missing.map((t) => PHOTO_TYPE_LABELS[t]).join(", ")}
              </p>
            )}
          </div>
        )}
        {conditionPhotos.length === 0 ? <EmptyState title="Aucune photo d'état" description="Photographiez le véhicule sous tous les angles à la réception." /> : <PhotoGallery photos={conditionPhotos} workOrderId={workOrderId} canDelete={canEdit} />}
      </Card>

      <Card title={`Dommages existants (${damages.length})`}>
        {canEdit && (
          <ActionForm action={addDamageAction} hidden={{ workOrderId }} className="mb-5 grid gap-3 rounded-[12px] bg-surface-2 p-3 sm:grid-cols-4" resetOnSuccess>
            {(state) => (
              <>
                <Field label="Type" name="damage-type" error={state.fields?.type} required>
                  <select id="damage-type" name="type" className="input" defaultValue="SCRATCH">
                    {Object.entries(DAMAGE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Emplacement" name="damage-location" error={state.fields?.location} required>
                  <input id="damage-location" name="location" className="input" placeholder="Aile avant droite" required />
                </Field>
                <Field label="Description" name="damage-description" error={state.fields?.description}>
                  <input id="damage-description" name="description" className="input" placeholder="Facultatif" />
                </Field>
                <div className="flex items-end">
                  <SubmitButton className="btn-block" pendingText="Ajout…">
                    Ajouter le dommage
                  </SubmitButton>
                </div>
              </>
            )}
          </ActionForm>
        )}
        {damages.length === 0 ? (
          <EmptyState title="Aucun dommage documenté" description="Rayures, bosses, impacts, jantes, pare-brise : documentez-les avec photo pour vous protéger." />
        ) : (
          <ul className="divide-y divide-line">
            {damages.map((d) => {
              const dPhotos = photos.filter((p) => p.damageId === d.id);
              return (
                <li key={d.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="badge bg-warn-soft text-warn">{DAMAGE_TYPE_LABELS[d.type]}</span>
                      <span className="ml-2 font-bold">{d.location}</span>
                      {d.description && <span className="ml-2 text-sm text-ink-2">{d.description}</span>}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <PhotoUploader workOrderId={workOrderId} types={["DAMAGE"]} damageId={d.id} compact />
                        <InlineAction action={deleteDamageAction} hidden={{ workOrderId, damageId: d.id }} variant="danger" confirm="Supprimer ce dommage ?">
                          <Trash2 className="h-4 w-4" />
                        </InlineAction>
                      </div>
                    )}
                  </div>
                  {dPhotos.length > 0 && (
                    <div className="mt-2">
                      <PhotoGallery photos={dPhotos} workOrderId={workOrderId} canDelete={canEdit} small />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
