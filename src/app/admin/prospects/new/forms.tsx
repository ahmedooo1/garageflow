"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { createManualLeadAction, importCsvAction } from "@/server/actions/growth";

export function ManualLeadForm() {
  return (
    <ActionForm action={createManualLeadAction} className="space-y-3">
      {(state) => (
        <>
          <Field label="Nom du garage" name="name" error={state.fields?.name} required>
            <input id="name" name="name" className="input" required maxLength={160} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code postal" name="postalCode" error={state.fields?.postalCode} required>
              <input id="postalCode" name="postalCode" className="input" inputMode="numeric" maxLength={5} required />
            </Field>
            <Field label="Ville" name="city">
              <input id="city" name="city" className="input" maxLength={80} />
            </Field>
          </div>
          <Field label="Adresse" name="address">
            <input id="address" name="address" className="input" maxLength={200} />
          </Field>
          <Field label="SIRET" name="siret" hint="Facultatif, 14 chiffres">
            <input id="siret" name="siret" className="input" inputMode="numeric" maxLength={20} />
          </Field>
          <Field label="Source (adresse de la page consultée)" name="sourceUrl" error={state.fields?.sourceUrl} required>
            <input id="sourceUrl" name="sourceUrl" className="input" type="url" required placeholder="https://annuaire-entreprises.data.gouv.fr/…" />
          </Field>
          <SubmitButton pendingText="Ajout…">Ajouter</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ImportForm() {
  return (
    <ActionForm action={importCsvAction} className="space-y-3" resetOnSuccess>
      {(state) => (
        <>
          {state.ok && state.data && <p className="rounded-[10px] bg-ok-soft px-3 py-2 text-sm font-medium text-ok">{state.data}</p>}
          <Field label="Fichier CSV" name="file">
            <input id="file" name="file" type="file" accept=".csv,text/csv" className="input" />
          </Field>
          <Field label="Ou collez le contenu" name="csv">
            <textarea id="csv" name="csv" rows={6} className="input font-mono text-xs" placeholder="nom;code_postal;ville;email;source_url" />
          </Field>
          <SubmitButton pendingText="Import…">Importer</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
