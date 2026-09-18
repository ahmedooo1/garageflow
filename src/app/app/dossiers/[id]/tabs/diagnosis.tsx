"use client";

import type { CheckStatus, Role, WorkOrderStatus } from "@prisma/client";
import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { ActionForm, InlineAction, SubmitButton } from "@/components/forms";
import { PhotoGallery } from "@/components/photo-gallery";
import { PhotoUploader } from "@/components/photo-uploader";
import { CheckBadge, UrgencyBadge } from "@/components/status-badge";
import { Card, EmptyState, Field } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { CHECKLIST_SECTIONS, CHECK_STATUS_LABELS, CHECK_STATUS_ORDER, FINDING_CATEGORIES, URGENCY_LABELS, URGENCY_ORDER } from "@/lib/labels";
import { hasPermission } from "@/lib/rbac";
import { isTerminal } from "@/lib/state-machine";
import type { ActionState } from "@/server/actions/helpers";
import { addFindingAction, deleteFindingAction, updateChecklistAction } from "@/server/actions/workorders";
import type { PhotoView } from "@/server/services/photos";
import type { ChecklistView, FindingView } from "../view-model";

export function DiagnosisTab({
  workOrderId,
  status,
  findings,
  checklist,
  photos,
  role,
}: {
  workOrderId: string;
  status: WorkOrderStatus;
  findings: FindingView[];
  checklist: ChecklistView[];
  photos: PhotoView[];
  role: Role;
}) {
  const canEdit = hasPermission(role, "diagnosis:write") && !isTerminal(status);
  return (
    <div className="grid gap-4">
      <Card title={`Constats du technicien (${findings.length})`}>
        {canEdit && (
          <ActionForm action={addFindingAction} hidden={{ workOrderId }} className="mb-5 grid gap-3 rounded-[12px] bg-surface-2 p-3 sm:grid-cols-2" resetOnSuccess>
            {(state) => (
              <>
                <Field label="Titre" name="f-title" error={state.fields?.title} required>
                  <input id="f-title" name="title" className="input" placeholder="Plaquettes avant usées" required />
                </Field>
                <Field label="Catégorie" name="f-category" error={state.fields?.category} required>
                  <select id="f-category" name="category" className="input" defaultValue="Freinage">
                    {FINDING_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Description" name="f-description" error={state.fields?.description} className="sm:col-span-2">
                  <textarea id="f-description" name="description" className="input" rows={2} placeholder="Mesures, observations…" />
                </Field>
                <Field label="Urgence" name="f-urgency" error={state.fields?.urgency} required>
                  <select id="f-urgency" name="urgency" className="input" defaultValue="RECOMMENDED">
                    {URGENCY_ORDER.map((u) => (
                      <option key={u} value={u}>
                        {URGENCY_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-end">
                  <SubmitButton className="btn-block" pendingText="Ajout…">
                    Ajouter le constat
                  </SubmitButton>
                </div>
              </>
            )}
          </ActionForm>
        )}
        {findings.length === 0 ? (
          <EmptyState title="Aucun constat" description="Le diagnostic est saisi par le technicien : aucun constat n'est généré automatiquement." />
        ) : (
          <ul className="space-y-3" data-testid="findings-list">
            {findings.map((f) => {
              const fPhotos = photos.filter((p) => p.findingId === f.id);
              return (
                <li key={f.id} className="rounded-[12px] border border-line p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-bold">{f.title}</p>
                      <p className="text-xs font-semibold text-muted">
                        {f.category} · {f.authorName} · {formatDateTime(f.createdAt)}
                      </p>
                      {f.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{f.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <UrgencyBadge urgency={f.urgency} />
                      {canEdit && (
                        <>
                          <PhotoUploader workOrderId={workOrderId} types={["FINDING"]} findingId={f.id} compact />
                          <InlineAction action={deleteFindingAction} hidden={{ workOrderId, findingId: f.id }} variant="danger" confirm="Supprimer ce constat ?">
                            <Trash2 className="h-4 w-4" />
                          </InlineAction>
                        </>
                      )}
                    </div>
                  </div>
                  {fPhotos.length > 0 && (
                    <div className="mt-3">
                      <PhotoGallery photos={fPhotos} workOrderId={workOrderId} canDelete={canEdit} small />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Contrôle véhicule">
        <div className="grid gap-5 lg:grid-cols-2">
          {CHECKLIST_SECTIONS.map((section) => (
            <div key={section.section}>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-2">{section.section}</h3>
              <ul className="space-y-2">
                {section.items.map((def) => {
                  const item = checklist.find((c) => c.key === def.key)!;
                  return <ChecklistRow key={def.key} workOrderId={workOrderId} item={item} canEdit={canEdit} photos={photos.filter((p) => p.checklistId && p.checklistId === item.id)} />;
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ChecklistRow({ workOrderId, item, canEdit, photos }: { workOrderId: string; item: ChecklistView; canEdit: boolean; photos: PhotoView[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateChecklistAction, { ok: false });
  const [comment, setComment] = useState(item.comment);
  const [open, setOpen] = useState(Boolean(item.comment));

  function submit(form: HTMLFormElement | null, statusValue: CheckStatus) {
    if (!form) return;
    const hidden = form.querySelector<HTMLInputElement>('input[name="status"]');
    if (hidden) hidden.value = statusValue;
    form.requestSubmit();
  }

  return (
    <li className="rounded-[10px] border border-line p-2.5">
      <form action={formAction}>
        <input type="hidden" name="workOrderId" value={workOrderId} />
        <input type="hidden" name="key" value={item.key} />
        <input type="hidden" name="status" value={item.status} />
        <input type="hidden" name="comment" value={comment} />
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-semibold">{item.label}</span>
          <div className="flex items-center gap-2">
            {pending ? <span className="text-xs text-muted">…</span> : <CheckBadge status={item.status} />}
            {canEdit && (
              <button type="button" className="text-xs font-semibold text-muted underline" onClick={() => setOpen((o) => !o)}>
                {open ? "Masquer" : "Commentaire"}
              </button>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="segmented" role="group" aria-label={`Statut ${item.label}`}>
            {CHECK_STATUS_ORDER.map((s) => (
              <button key={s} type="button" aria-pressed={item.status === s} onClick={(e) => submit(e.currentTarget.form, s)} disabled={pending} data-testid={`check-${item.key}-${s}`}>
                {CHECK_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        )}
        {canEdit && open && (
          <div className="mt-2 flex gap-2">
            <input className="input min-h-10 py-1 text-sm" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Commentaire" maxLength={1000} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => submit(e.currentTarget.form, item.status)} disabled={pending}>
              OK
            </button>
            {item.id && <PhotoUploader workOrderId={workOrderId} types={["CHECKLIST"]} checklistId={item.id} compact />}
          </div>
        )}
        {!canEdit && item.comment && <p className="text-sm text-ink-2">{item.comment}</p>}
        {!state.ok && state.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
      </form>
      {photos.length > 0 && (
        <div className="mt-2">
          <PhotoGallery photos={photos} workOrderId={workOrderId} canDelete={canEdit} small />
        </div>
      )}
    </li>
  );
}
