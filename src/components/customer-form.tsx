"use client";

import type { Customer } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { createCustomerAction, updateCustomerAction } from "@/server/actions/customers";

export function CustomerForm({ customer, returnTo }: { customer?: Customer; returnTo?: string }) {
  const action = customer ? updateCustomerAction : createCustomerAction;
  return (
    <ActionForm action={action} className="space-y-4" hidden={{ id: customer?.id, returnTo }}>
      {(state) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" name="firstName" error={state.fields?.firstName} required>
              <input id="firstName" name="firstName" className="input" defaultValue={customer?.firstName} required autoFocus={!customer} />
            </Field>
            <Field label="Nom" name="lastName" error={state.fields?.lastName} required>
              <input id="lastName" name="lastName" className="input" defaultValue={customer?.lastName} required />
            </Field>
            <Field label="Téléphone" name="phone" error={state.fields?.phone}>
              <input id="phone" name="phone" type="tel" inputMode="tel" className="input" defaultValue={customer?.phone} />
            </Field>
            <Field label="Email" name="email" error={state.fields?.email}>
              <input id="email" name="email" type="email" className="input" defaultValue={customer?.email} />
            </Field>
          </div>
          <Field label="Adresse" name="address" error={state.fields?.address}>
            <input id="address" name="address" className="input" defaultValue={customer?.address} autoComplete="street-address" />
          </Field>
          <Field label="Notes" name="notes" error={state.fields?.notes}>
            <textarea id="notes" name="notes" className="input" defaultValue={customer?.notes} rows={3} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SubmitButton size="lg" pendingText="Enregistrement…">
              {customer ? "Enregistrer" : "Créer le client"}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
