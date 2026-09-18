"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { UrgencyBadge } from "@/components/status-badge";
import { Field } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { formatEur, money } from "@/lib/pricing";
import { submitDecisionAction } from "@/server/actions/portal";
import type { PortalData } from "@/server/services/approvals";

type Line = PortalData["estimate"]["lines"][number];

export function DecisionForm({ token, lines, totalTtc, expiresAt }: { token: string; lines: Line[]; totalTtc: string; expiresAt: string }) {
  const router = useRouter();
  const [choices, setChoices] = useState<Record<string, "ACCEPTED" | "REFUSED" | undefined>>({});
  const allChosen = lines.every((l) => choices[l.id]);
  const acceptedTotal = useMemo(
    () => lines.reduce((sum, l) => (choices[l.id] === "ACCEPTED" ? sum.plus(l.totalTtc) : sum), money(0)),
    [lines, choices],
  );

  return (
    <ActionForm action={submitDecisionAction} hidden={{ token }} onSuccess={() => router.refresh()}>
      {() => (
        <>
          <ul className="space-y-3" data-testid="portal-lines">
            {lines.map((l) => {
              const choice = choices[l.id];
              return (
                <li key={l.id} className={`rounded-[12px] border-2 p-3 sm:p-4 ${choice === "ACCEPTED" ? "border-ok bg-ok-soft/40" : choice === "REFUSED" ? "border-danger/50 bg-danger-soft/30" : "border-line"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-bold">{l.title}</p>
                      {l.findingTitle && <p className="text-xs text-muted">Lié au constat : {l.findingTitle}</p>}
                      {l.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{l.description}</p>}
                    </div>
                    <UrgencyBadge urgency={l.urgency} />
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Pièces HT</dt>
                      <dd>{formatEur(l.partsPrice)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Main-d&apos;œuvre HT</dt>
                      <dd>{formatEur(l.laborPrice)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">TVA {Number(l.vatRate)} %</dt>
                      <dd>{formatEur(l.vatAmount)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-lg font-extrabold">{formatEur(l.totalTtc)} TTC</p>
                  <input type="hidden" name={`line:${l.id}`} value={choice ?? ""} />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setChoices((c) => ({ ...c, [l.id]: "ACCEPTED" }))}
                      aria-pressed={choice === "ACCEPTED"}
                      data-testid={`accept-${l.id}`}
                      className={`btn btn-lg ${choice === "ACCEPTED" ? "btn-success" : "btn-secondary"}`}
                    >
                      <Check className="h-5 w-5" /> Autoriser
                    </button>
                    <button
                      type="button"
                      onClick={() => setChoices((c) => ({ ...c, [l.id]: "REFUSED" }))}
                      aria-pressed={choice === "REFUSED"}
                      data-testid={`refuse-${l.id}`}
                      className={`btn btn-lg ${choice === "REFUSED" ? "btn-danger" : "btn-secondary"}`}
                    >
                      <X className="h-5 w-5" /> Refuser
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 rounded-[12px] bg-surface-2 p-4">
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Total proposé</span>
              <span>{formatEur(totalTtc)} TTC</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xl font-extrabold">
              <span>Montant accepté</span>
              <span data-testid="accepted-total">{formatEur(acceptedTotal)} TTC</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <Field label="Votre nom (signature)" name="customerName">
              <input id="customerName" name="customerName" className="input" placeholder="Prénom Nom" autoComplete="name" />
            </Field>
            <Field label="Commentaire pour le garage (facultatif)" name="comment">
              <textarea id="comment" name="comment" className="input" rows={2} />
            </Field>
          </div>

          <SubmitButton className="btn-block btn-lg mt-4" disabled={!allChosen} pendingText="Enregistrement…">
            {allChosen ? "Confirmer ma décision" : "Choisissez pour chaque intervention"}
          </SubmitButton>
          <p className="mt-3 text-center text-xs text-muted">
            Votre décision est définitive et horodatée. Lien valable jusqu&apos;au {formatDateTime(expiresAt)}.
          </p>
        </>
      )}
    </ActionForm>
  );
}
