"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { demoRequestAction } from "@/server/actions/growth";
import type { ActionState } from "@/server/actions/helpers";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="action action--mark action--xl w-full justify-center sm:w-auto">
      {pending ? "Envoi…" : "Demander une démonstration"}
    </button>
  );
}

function Input({ name, label, error, ...rest }: { name: string; label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={`demo-${name}`} className="field-tag mb-1.5 block">
        {label}
      </label>
      <input id={`demo-${name}`} name={name} aria-invalid={error ? true : undefined} className="input" {...rest} />
      {error && <p className="mt-1 text-sm font-medium text-[#b3440a]">{error}</p>}
    </div>
  );
}

export function DemoForm() {
  const [state, action] = useActionState<ActionState, FormData>(demoRequestAction, { ok: false });

  if (state.ok) {
    return (
      <div role="status" className="border-t-2 border-[var(--ink)] pt-6">
        <p className="display text-2xl">Merci, c&apos;est noté.</p>
        <p className="mt-3 max-w-[46ch] leading-relaxed text-[var(--ink-soft)]">
          Nous vous recontactons par email ou par téléphone pour convenir d&apos;un créneau.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-[#b3440a] sm:col-span-2">
          {state.error}
        </p>
      )}
      <Input name="name" label="Votre nom" autoComplete="name" required maxLength={120} error={state.fields?.name} />
      <Input name="garageName" label="Nom du garage" autoComplete="organization" required maxLength={160} error={state.fields?.garageName} />
      <Input name="email" label="Email" type="email" autoComplete="email" required error={state.fields?.email} />
      <Input name="phone" label="Téléphone (facultatif)" type="tel" autoComplete="tel" maxLength={30} error={state.fields?.phone} />
      <Input name="postalCode" label="Code postal du garage" inputMode="numeric" autoComplete="postal-code" required maxLength={5} error={state.fields?.postalCode} />
      <div className="sm:col-span-2">
        <label htmlFor="demo-message" className="field-tag mb-1.5 block">
          Un mot sur votre atelier (facultatif)
        </label>
        <textarea id="demo-message" name="message" rows={3} maxLength={1000} className="input" />
      </div>
      {/* Champ piège : invisible pour les personnes, rempli par les robots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="demo-website">Site web</label>
        <input id="demo-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-4 sm:col-span-2">
        <Submit />
        <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
          Ces informations servent uniquement à organiser la démonstration et à vous recontacter à ce sujet.{" "}
          <Link href="/confidentialite#prospection" className="underline underline-offset-4">
            En savoir plus
          </Link>
        </p>
      </div>
    </form>
  );
}
