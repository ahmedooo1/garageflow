"use client";

import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { resetPasswordAction } from "@/server/actions/auth";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  return (
    <ActionForm action={resetPasswordAction} className="space-y-4" hidden={{ token }} onSuccess={() => router.push("/login?reset=1")}>
      {(state) => (
        <>
          <Field label="Nouveau mot de passe" name="password" error={state.fields?._} hint="10 caractères minimum" required>
            <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={10} required autoFocus />
          </Field>
          <Field label="Confirmation" name="confirm" required>
            <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={10} required />
          </Field>
          <SubmitButton className="btn-block btn-lg" pendingText="Enregistrement…">
            Enregistrer
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
