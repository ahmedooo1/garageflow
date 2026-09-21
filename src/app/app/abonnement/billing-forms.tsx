"use client";

import type { Plan } from "@prisma/client";
import { CreditCard, ExternalLink } from "lucide-react";
import { useActionState } from "react";
import { SubmitButton } from "@/components/forms";
import { openPortalAction, startCheckoutAction } from "@/server/actions/billing";
import type { ActionState } from "@/server/actions/helpers";

export function CheckoutButton({ plan, label, disabled }: { plan: Plan; label: string; disabled?: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(startCheckoutAction, { ok: false });
  return (
    <form action={action}>
      <input type="hidden" name="plan" value={plan} />
      <SubmitButton className="btn-block" pendingText="Redirection…" disabled={disabled}>
        <CreditCard className="h-4 w-4" />
        {label}
      </SubmitButton>
      {!state.ok && state.error && <p className="mt-2 text-sm font-medium text-danger">{state.error}</p>}
    </form>
  );
}

export function PortalButton() {
  const [state, action] = useActionState<ActionState, FormData>(openPortalAction, { ok: false });
  return (
    <form action={action}>
      <SubmitButton variant="secondary" pendingText="Ouverture…">
        <ExternalLink className="h-4 w-4" />
        Gérer ma facturation
      </SubmitButton>
      {!state.ok && state.error && <p className="mt-2 text-sm font-medium text-danger">{state.error}</p>}
    </form>
  );
}
