"use client";

import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Field } from "@/components/ui";
import { loginAction } from "@/server/actions/auth";

export function LoginForm({ next, resetDone }: { next?: string; resetDone?: boolean }) {
  return (
    <>
      {resetDone && (
        <Alert tone="ok" className="mb-4">
          Mot de passe modifié. Vous pouvez vous connecter.
        </Alert>
      )}
      <ActionForm action={loginAction} className="space-y-4" hidden={{ next }}>
        {(state) => (
          <>
            <Field label="Email" name="email" error={state.fields?.email} required>
              <input id="email" name="email" type="email" autoComplete="email" className="input" required autoFocus />
            </Field>
            <Field label="Mot de passe" name="password" error={state.fields?.password} required>
              <input id="password" name="password" type="password" autoComplete="current-password" className="input" required />
            </Field>
            <SubmitButton className="btn-block btn-lg" pendingText="Connexion…">
              Se connecter
            </SubmitButton>
            <p className="text-center text-sm">
              <Link href="/forgot-password" className="font-semibold text-muted hover:text-ink">
                Mot de passe oublié ?
              </Link>
            </p>
          </>
        )}
      </ActionForm>
    </>
  );
}
