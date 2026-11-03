"use client";

import { useActionState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert } from "@/components/ui";
import { addSuppressionAction, runJobAction, updateGrowthSettingsAction } from "@/server/actions/growth";
import type { ActionState } from "@/server/actions/helpers";

const JOB_LABELS: Record<string, { label: string; hint: string }> = {
  discovery: { label: "Découverte SIRENE", hint: "Garages actifs (NAF 45.20A) des zones configurées" },
  enrich: { label: "Vérification des sites", hint: "Page d'accueil des sites renseignés, robots.txt respecté" },
  score: { label: "Qualification", hint: "Recalcule les scores et suit les inscriptions" },
  drafts: { label: "Préparation des brouillons", hint: "Premiers contacts et relances dues, rien n'est envoyé" },
  "weekly-report": { label: "Rapport hebdomadaire", hint: "Envoyé à GROWTH_REPORT_TO" },
};

export function JobRunner({ jobs }: { jobs: readonly string[] }) {
  const [state, action] = useActionState<ActionState<string>, FormData>(runJobAction, { ok: false });
  return (
    <div className="space-y-3">
      {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.data && (
        <pre className="max-h-64 overflow-auto rounded-[10px] bg-surface-2 p-3 text-xs">{JSON.stringify(JSON.parse(state.data), null, 2)}</pre>
      )}
      <ul className="divide-y divide-line">
        {jobs.map((job) => (
          <li key={job} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">{JOB_LABELS[job]?.label ?? job}</p>
              <p className="text-xs text-muted">{JOB_LABELS[job]?.hint}</p>
            </div>
            <form action={action} className="flex gap-2">
              <input type="hidden" name="job" value={job} />
              <SubmitButton variant="secondary" size="sm" name="dryRun" value="1" pendingText="…">
                Simuler
              </SubmitButton>
              <SubmitButton variant="dark" size="sm" name="dryRun" value="0" pendingText="…">
                Exécuter
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsForm({ paused, aiEnabled, budget }: { paused: boolean; aiEnabled: boolean; budget: number }) {
  return (
    <ActionForm action={updateGrowthSettingsAction} className="space-y-3" successMessage="Réglages enregistrés">
      <label className="flex items-start gap-3 rounded-[10px] border border-danger/30 bg-danger-soft p-3 text-sm">
        <input type="checkbox" name="paused" defaultChecked={paused} className="mt-1" />
        <span>
          <strong>Arrêt d&apos;urgence</strong>
          <br />
          Plus aucune tâche planifiée et plus aucun envoi tant que la case est cochée.
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="aiEnabled" defaultChecked={aiEnabled} className="mt-1" />
        <span>
          <strong>Rédaction assistée des brouillons</strong>
          <br />
          Le modèle ne reçoit que des faits structurés, jamais le texte d&apos;un site. Sans clé ou au-delà du budget, les modèles de message sont utilisés.
        </span>
      </label>
      <div className="flex items-end gap-2">
        <div className="w-40">
          <label className="field-label" htmlFor="aiMonthlyBudgetUsd">
            Budget mensuel ($)
          </label>
          <input id="aiMonthlyBudgetUsd" name="aiMonthlyBudgetUsd" type="number" min={0} max={200} defaultValue={budget} className="input min-h-10 py-1" />
        </div>
        <SubmitButton variant="dark" size="sm" pendingText="…">
          Enregistrer
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SuppressionForm() {
  return (
    <ActionForm action={addSuppressionAction} className="flex flex-wrap items-end gap-2" resetOnSuccess successMessage="Ajouté à la liste d'opposition">
      <select name="kind" className="input min-h-10 w-32 py-1" aria-label="Type">
        <option value="EMAIL">Email</option>
        <option value="DOMAIN">Domaine</option>
        <option value="SIRET">SIRET</option>
      </select>
      <input name="value" className="input min-h-10 flex-1 py-1" placeholder="contact@garage.fr, garage.fr ou SIRET" required />
      <input name="reason" className="input min-h-10 flex-1 py-1" placeholder="Motif" maxLength={300} />
      <SubmitButton variant="secondary" size="sm" pendingText="…">
        Exclure
      </SubmitButton>
    </ActionForm>
  );
}
