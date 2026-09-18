"use client";

import clsx from "clsx";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/server/actions/helpers";
import { Alert } from "./ui";

export function SubmitButton({
  children,
  className,
  variant = "primary",
  size,
  pendingText,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "dark" | "success" | "danger" | "ghost";
  size?: "sm" | "lg";
  pendingText?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      className={clsx("btn", `btn-${variant}`, size && `btn-${size}`, className)}
      {...rest}
    >
      {pending && (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export type ActionFn<T = void> = (prev: ActionState<T>, form: FormData) => Promise<ActionState<T>>;

/**
 * Formulaire branché sur une server action avec affichage d'erreur/succès.
 * `resetOnSuccess` vide le formulaire après une action réussie (ajout de ligne, etc.).
 */
export function ActionForm<T = void>({
  action,
  children,
  className,
  successMessage,
  resetOnSuccess,
  onSuccess,
  hidden,
}: {
  action: ActionFn<T>;
  children: ReactNode | ((state: ActionState<T>) => ReactNode);
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState<T>) => void;
  hidden?: Record<string, string | undefined>;
}) {
  const [state, formAction] = useActionState<ActionState<T>, FormData>(action, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  const lastSeq = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.ok && state.seq && state.seq !== lastSeq.current) {
      lastSeq.current = state.seq;
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
  }, [state, resetOnSuccess, onSuccess]);

  return (
    <form ref={ref} action={formAction} className={className} noValidate>
      {hidden &&
        Object.entries(hidden).map(([k, v]) => (v === undefined ? null : <input key={k} type="hidden" name={k} value={v} />))}
      {!state.ok && state.error && (
        <Alert tone="danger" className="mb-4">
          {state.error}
        </Alert>
      )}
      {state.ok && successMessage && (
        <Alert tone="ok" className="mb-4">
          {successMessage}
        </Alert>
      )}
      {typeof children === "function" ? children(state) : children}
    </form>
  );
}

/** Petit formulaire inline (un bouton) : erreur affichée sous le bouton. */
export function InlineAction({
  action,
  hidden,
  children,
  variant = "secondary",
  size = "sm",
  className,
  confirm,
  pendingText,
}: {
  action: ActionFn;
  hidden: Record<string, string>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "dark" | "success" | "danger" | "ghost";
  size?: "sm" | "lg";
  className?: string;
  confirm?: string;
  pendingText?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false });
  return (
    <form
      action={formAction}
      className={clsx("inline-flex flex-col gap-1", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size={size} pendingText={pendingText}>
        {children}
      </SubmitButton>
      {!state.ok && state.error && <span className="text-xs font-medium text-danger">{state.error}</span>}
    </form>
  );
}
