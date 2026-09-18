"use client";

import type { FinalCheck } from "@prisma/client";
import { ActionForm, InlineAction, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { deliverVehicleAction, saveFinalCheckAction, workOrderActionAction } from "@/server/actions/workorders";

const CHECKS: { key: keyof Pick<FinalCheck, "roadTest" | "fluids" | "warningLights" | "toolsRemoved" | "cleaned">; label: string }[] = [
  { key: "roadTest", label: "Essai routier effectué" },
  { key: "fluids", label: "Niveaux vérifiés (huile, liquide de frein, refroidissement)" },
  { key: "warningLights", label: "Aucun voyant au tableau de bord" },
  { key: "toolsRemoved", label: "Outils et chiffons retirés, capot fermé" },
  { key: "cleaned", label: "Véhicule propre (volant, siège, tapis)" },
];

export function FinalCheckForm({ workOrderId, check, canEdit }: { workOrderId: string; check: FinalCheck | null; canEdit: boolean }) {
  return (
    <ActionForm action={saveFinalCheckAction} hidden={{ workOrderId }} className="space-y-3" successMessage="Contrôle final enregistré.">
      {() => (
        <>
          {check && <p className="text-xs text-muted">Dernier enregistrement : {formatDateTime(check.checkedAt)}</p>}
          <ul className="space-y-2">
            {CHECKS.map((c) => (
              <li key={c.key}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] border border-line px-3 py-2 hover:bg-surface-2">
                  <input type="checkbox" name={c.key} defaultChecked={check?.[c.key] ?? false} className="h-6 w-6 accent-accent" disabled={!canEdit} data-testid={`final-${c.key}`} />
                  <span className="font-medium">{c.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <Field label="Commentaire" name="fc-comment">
            <textarea id="fc-comment" name="comment" className="input" rows={2} defaultValue={check?.comment ?? ""} disabled={!canEdit} />
          </Field>
          {canEdit && (
            <SubmitButton variant="dark" pendingText="Enregistrement…" data-testid="save-final-check">
              Enregistrer le contrôle final
            </SubmitButton>
          )}
        </>
      )}
    </ActionForm>
  );
}

export function MarkReadyButton({ workOrderId }: { workOrderId: string }) {
  return (
    <InlineAction action={workOrderActionAction} hidden={{ workOrderId, action: "MARK_READY" }} variant="success" size="lg" className="w-full [&>button]:w-full" pendingText="…">
      Marquer véhicule prêt
    </InlineAction>
  );
}

export function DeliverForm({ workOrderId, mileageIn }: { workOrderId: string; mileageIn: number }) {
  return (
    <ActionForm action={deliverVehicleAction} hidden={{ workOrderId }} className="space-y-3">
      {(state) => (
        <>
          <Field label="Kilométrage à la sortie" name="mileageOut" error={state.fields?.mileageOut} required>
            <input id="mileageOut" name="mileageOut" type="number" inputMode="numeric" min={mileageIn} defaultValue={mileageIn} className="input text-lg font-bold" required />
          </Field>
          <Field label="Remarque de restitution" name="deliver-comment">
            <textarea id="deliver-comment" name="comment" className="input" rows={2} placeholder="Facultatif : conseils donnés au client, prochain rendez-vous…" />
          </Field>
          <SubmitButton variant="success" size="lg" className="btn-block" pendingText="Enregistrement…" data-testid="deliver">
            Restituer le véhicule
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function CloseButton({ workOrderId }: { workOrderId: string }) {
  return (
    <InlineAction action={workOrderActionAction} hidden={{ workOrderId, action: "CLOSE" }} variant="success" size="lg" className="w-full [&>button]:w-full" pendingText="…">
      Clôturer le dossier
    </InlineAction>
  );
}
