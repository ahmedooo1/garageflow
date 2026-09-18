"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { forgotPasswordAction } from "@/server/actions/auth";

export function ForgotForm() {
  return (
    <ActionForm
      action={forgotPasswordAction}
      className="space-y-4"
      successMessage="Si un compte correspond à cet email, un lien de réinitialisation a été envoyé (valable 1 heure)."
      resetOnSuccess
    >
      {(state) => (
        <>
          <Field label="Email" name="email" error={state.fields?.email} required>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required autoFocus />
          </Field>
          <SubmitButton className="btn-block btn-lg" pendingText="Envoi…">
            Envoyer le lien
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
