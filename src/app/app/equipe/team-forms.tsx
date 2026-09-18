"use client";

import type { Role } from "@prisma/client";
import { useActionState } from "react";
import { ActionForm, InlineAction, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/rbac";
import type { ActionState } from "@/server/actions/helpers";
import { createUserAction, setUserActiveAction, updateUserRoleAction } from "@/server/actions/users";

export function CreateUserForm() {
  return (
    <ActionForm action={createUserAction} className="space-y-3" successMessage="Membre ajouté." resetOnSuccess>
      {(state) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" name="u-firstName" error={state.fields?.firstName} required>
              <input id="u-firstName" name="firstName" className="input" required />
            </Field>
            <Field label="Nom" name="u-lastName" error={state.fields?.lastName} required>
              <input id="u-lastName" name="lastName" className="input" required />
            </Field>
          </div>
          <Field label="Email" name="u-email" error={state.fields?.email} required>
            <input id="u-email" name="email" type="email" className="input" required />
          </Field>
          <Field label="Mot de passe provisoire" name="u-password" error={state.fields?.password} hint="10 caractères minimum" required>
            <input id="u-password" name="password" type="text" className="input" autoComplete="off" minLength={10} required />
          </Field>
          <Field label="Rôle" name="u-role" error={state.fields?.role} required>
            <select id="u-role" name="role" className="input" defaultValue="TECHNICIAN">
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton className="btn-block" pendingText="Ajout…">
            Ajouter
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function UserRowActions({ userId, role, active }: { userId: string; role: Role; active: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateUserRoleAction, { ok: false });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <select name="role" defaultValue={role} className="input min-h-10 py-1 text-sm" aria-label="Rôle" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {!state.ok && state.error && <span className="text-xs text-danger">{state.error}</span>}
      </form>
      <InlineAction action={setUserActiveAction} hidden={{ userId, active: active ? "0" : "1" }} variant={active ? "danger" : "success"} confirm={active ? "Désactiver ce compte ? Ses sessions seront fermées." : undefined}>
        {active ? "Désactiver" : "Réactiver"}
      </InlineAction>
    </div>
  );
}
