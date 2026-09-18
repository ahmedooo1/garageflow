"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { updateGarageSettingsAction } from "@/server/actions/users";

type GarageSettings = { name: string; address: string; phone: string; email: string; siret: string; vatRate: string };

export function SettingsForm({ garage }: { garage: GarageSettings }) {
  return (
    <ActionForm action={updateGarageSettingsAction} className="space-y-4" successMessage="Paramètres enregistrés.">
      {(state) => (
        <>
          <Field label="Nom du garage" name="name" error={state.fields?.name} required>
            <input id="name" name="name" className="input" defaultValue={garage.name} required />
          </Field>
          <Field label="Adresse" name="address" error={state.fields?.address}>
            <input id="address" name="address" className="input" defaultValue={garage.address} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Téléphone" name="phone" error={state.fields?.phone}>
              <input id="phone" name="phone" type="tel" className="input" defaultValue={garage.phone} />
            </Field>
            <Field label="Email" name="email" error={state.fields?.email}>
              <input id="email" name="email" type="email" className="input" defaultValue={garage.email} />
            </Field>
            <Field label="SIRET" name="siret" error={state.fields?.siret}>
              <input id="siret" name="siret" className="input" defaultValue={garage.siret} />
            </Field>
            <Field label="Taux de TVA par défaut (%)" name="vatRate" error={state.fields?.vatRate}>
              <input id="vatRate" name="vatRate" type="number" step="0.1" min={0} max={100} className="input" defaultValue={garage.vatRate} />
            </Field>
          </div>
          <div className="flex justify-end pt-2">
            <SubmitButton size="lg" pendingText="Enregistrement…">
              Enregistrer
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
