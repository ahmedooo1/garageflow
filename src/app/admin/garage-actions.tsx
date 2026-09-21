"use client";

import { useActionState } from "react";
import { InlineAction, SubmitButton } from "@/components/forms";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { activatePlanAction, extendTrialAction, suspendGarageAction, unsuspendGarageAction } from "@/server/actions/platform";
import type { ActionState } from "@/server/actions/helpers";

export function GarageActions({ garageId, garageName, suspended }: { garageId: string; garageName: string; suspended: boolean }) {
  const [trialState, trialAction] = useActionState<ActionState, FormData>(extendTrialAction, { ok: false });
  const [planState, planAction] = useActionState<ActionState, FormData>(activatePlanAction, { ok: false });

  return (
    <div className="flex w-full shrink-0 flex-col gap-3 rounded-[10px] bg-surface-2 p-3 lg:w-80">
      <form action={trialAction} className="flex items-end gap-2">
        <input type="hidden" name="garageId" value={garageId} />
        <div className="flex-1">
          <label className="field-label" htmlFor={`days-${garageId}`}>
            Prolonger l&apos;essai
          </label>
          <input id={`days-${garageId}`} name="days" type="number" min={1} max={90} defaultValue={14} className="input min-h-10 py-1" />
        </div>
        <SubmitButton variant="secondary" size="sm" pendingText="…">
          Jours
        </SubmitButton>
      </form>
      {!trialState.ok && trialState.error && <p className="text-xs font-medium text-danger">{trialState.error}</p>}

      <form action={planAction} className="flex items-end gap-2">
        <input type="hidden" name="garageId" value={garageId} />
        <div className="flex-1">
          <label className="field-label" htmlFor={`plan-${garageId}`}>
            Activer un plan
          </label>
          <select id={`plan-${garageId}`} name="plan" className="input min-h-10 py-1" defaultValue="ATELIER">
            {PLAN_ORDER.map((p) => (
              <option key={p} value={p}>
                {PLANS[p].name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-20">
          <label className="field-label" htmlFor={`months-${garageId}`}>
            Mois
          </label>
          <input id={`months-${garageId}`} name="months" type="number" min={1} max={36} defaultValue={12} className="input min-h-10 py-1" />
        </div>
        <SubmitButton variant="dark" size="sm" pendingText="…">
          OK
        </SubmitButton>
      </form>
      {!planState.ok && planState.error && <p className="text-xs font-medium text-danger">{planState.error}</p>}

      {suspended ? (
        <InlineAction action={unsuspendGarageAction} hidden={{ garageId }} variant="success" size="sm">
          Réactiver le compte
        </InlineAction>
      ) : (
        <SuspendForm garageId={garageId} garageName={garageName} />
      )}
    </div>
  );
}

function SuspendForm({ garageId, garageName }: { garageId: string; garageName: string }) {
  const [state, action] = useActionState<ActionState, FormData>(suspendGarageAction, { ok: false });
  return (
    <form
      action={action}
      className="flex items-end gap-2"
      onSubmit={(e) => {
        if (!window.confirm(`Suspendre « ${garageName} » ? Le garage ne pourra plus enregistrer de données.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="garageId" value={garageId} />
      <div className="flex-1">
        <label className="field-label" htmlFor={`reason-${garageId}`}>
          Suspendre (motif)
        </label>
        <input id={`reason-${garageId}`} name="reason" className="input min-h-10 py-1" placeholder="Impayé, abus…" maxLength={300} />
      </div>
      <SubmitButton variant="danger" size="sm" pendingText="…">
        Suspendre
      </SubmitButton>
      {!state.ok && state.error && <p className="text-xs font-medium text-danger">{state.error}</p>}
    </form>
  );
}
