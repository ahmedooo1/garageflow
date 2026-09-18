"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { registerAction } from "@/server/actions/auth";

export function RegisterForm() {
  return (
    <ActionForm action={registerAction} className="space-y-4">
      {(state) => (
        <>
          <Field label="Nom du garage" name="garageName" error={state.fields?.garageName} required>
            <input id="garageName" name="garageName" className="input" placeholder="Garage Normandie Auto" required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" name="firstName" error={state.fields?.firstName} required>
              <input id="firstName" name="firstName" className="input" autoComplete="given-name" required />
            </Field>
            <Field label="Nom" name="lastName" error={state.fields?.lastName} required>
              <input id="lastName" name="lastName" className="input" autoComplete="family-name" required />
            </Field>
          </div>
          <Field label="Téléphone du garage" name="phone" error={state.fields?.phone}>
            <input id="phone" name="phone" className="input" type="tel" autoComplete="tel" />
          </Field>
          <Field label="Email" name="email" error={state.fields?.email} required>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required />
          </Field>
          <Field label="Mot de passe" name="password" error={state.fields?.password} hint="10 caractères minimum" required>
            <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={10} required />
          </Field>
          <SubmitButton className="btn-block btn-lg" pendingText="Création…">
            Créer le garage
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
