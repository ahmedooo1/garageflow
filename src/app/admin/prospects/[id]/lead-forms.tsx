"use client";

import type { DraftKind, DraftStatus, LeadStage } from "@prisma/client";
import { useState } from "react";
import { ActionForm, InlineAction, SubmitButton } from "@/components/forms";
import { Field, Pill } from "@/components/ui";
import { DRAFT_KIND_LABELS, DRAFT_STATUS_LABELS, LEAD_STAGE_LABELS, LEAD_STAGES } from "@/lib/growth/labels";
import {
  addNoteAction,
  approveDraftAction,
  createDraftAction,
  discardDraftAction,
  enrichWebsiteAction,
  eraseLeadAction,
  logReplyAction,
  markSentAction,
  sendDraftAction,
  setFollowUpAction,
  setStageAction,
  updateContactAction,
  updateDraftAction,
} from "@/server/actions/growth";

type Contact = { website: string; email: string; emailSourceUrl: string; phone: string; phoneSourceUrl: string; contactName: string };

export function ContactForm({ leadId, contact, inbound }: { leadId: string; contact: Contact; inbound: boolean }) {
  return (
    <div className="space-y-3">
      <ActionForm action={updateContactAction} hidden={{ leadId }} className="space-y-3" successMessage="Coordonnées enregistrées">
        {(state) => (
          <>
            <Field label="Site web" name="website" error={state.fields?.website}>
              <input id="website" name="website" className="input" defaultValue={contact.website} placeholder="https://…" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email professionnel" name="email">
                <input id="email" name="email" type="email" className="input" defaultValue={contact.email} />
              </Field>
              <Field label="Page où l'email est publié" name="emailSourceUrl" hint={inbound ? "Fourni par le garage" : "Obligatoire avec un email"}>
                <input id="emailSourceUrl" name="emailSourceUrl" className="input" defaultValue={contact.emailSourceUrl} placeholder="https://…" />
              </Field>
              <Field label="Téléphone" name="phone">
                <input id="phone" name="phone" type="tel" className="input" defaultValue={contact.phone} />
              </Field>
              <Field label="Page où le numéro est publié" name="phoneSourceUrl">
                <input id="phoneSourceUrl" name="phoneSourceUrl" className="input" defaultValue={contact.phoneSourceUrl} placeholder="https://…" />
              </Field>
            </div>
            <Field label="Nom du contact" name="contactName" hint="Uniquement s'il est publié par le garage ou communiqué par lui">
              <input id="contactName" name="contactName" className="input" defaultValue={contact.contactName} />
            </Field>
            <SubmitButton variant="dark" size="sm" pendingText="…">
              Enregistrer
            </SubmitButton>
          </>
        )}
      </ActionForm>
      {contact.website && (
        <InlineAction action={enrichWebsiteAction} hidden={{ leadId }} pendingText="Vérification…">
          Vérifier le site maintenant
        </InlineAction>
      )}
    </div>
  );
}

export function StageForm({ leadId, stage }: { leadId: string; stage: LeadStage }) {
  return (
    <ActionForm action={setStageAction} hidden={{ leadId }} className="space-y-2" successMessage="Étape mise à jour">
      <select name="stage" defaultValue={stage} className="input" aria-label="Étape">
        {LEAD_STAGES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      <input name="note" className="input" placeholder="Motif (facultatif)" maxLength={300} />
      <p className="text-xs text-muted">« Ne pas contacter » ajoute l&apos;email et le SIRET à la liste d&apos;opposition.</p>
      <SubmitButton variant="secondary" size="sm" pendingText="…">
        Changer l&apos;étape
      </SubmitButton>
    </ActionForm>
  );
}

export function FollowUpForm({ leadId, value }: { leadId: string; value: string }) {
  return (
    <ActionForm action={setFollowUpAction} hidden={{ leadId }} className="flex items-end gap-2">
      <div className="flex-1">
        <label className="field-label" htmlFor="date">
          Prochaine relance
        </label>
        <input id="date" name="date" type="date" defaultValue={value} className="input min-h-10 py-1" />
      </div>
      <SubmitButton variant="secondary" size="sm" pendingText="…">
        OK
      </SubmitButton>
    </ActionForm>
  );
}

export function ReplyForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={logReplyAction} hidden={{ leadId }} className="space-y-2" resetOnSuccess successMessage="Réponse consignée">
      <textarea name="summary" rows={2} className="input" placeholder="Résumé de la réponse reçue" required />
      <input name="objection" className="input" placeholder="Objection exprimée (facultatif)" maxLength={500} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="optOut" /> Il ne souhaite plus être contacté
      </label>
      <SubmitButton variant="secondary" size="sm" pendingText="…">
        Consigner
      </SubmitButton>
    </ActionForm>
  );
}

export function NoteForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={addNoteAction} hidden={{ leadId }} className="space-y-2" resetOnSuccess>
      <textarea name="note" rows={2} className="input" placeholder="Note interne" required />
      <SubmitButton variant="secondary" size="sm" pendingText="…">
        Ajouter la note
      </SubmitButton>
    </ActionForm>
  );
}

export function NewDraftForm({ leadId, aiAvailable, aiReason, defaultKind }: { leadId: string; aiAvailable: boolean; aiReason: string; defaultKind: DraftKind }) {
  return (
    <ActionForm action={createDraftAction} hidden={{ leadId }} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="field-label" htmlFor="kind">
          Préparer un message
        </label>
        <select id="kind" name="kind" className="input min-h-10 py-1" defaultValue={defaultKind}>
          {(Object.keys(DRAFT_KIND_LABELS) as DraftKind[]).map((k) => (
            <option key={k} value={k}>
              {DRAFT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm" title={aiAvailable ? "" : aiReason}>
        <input type="checkbox" name="useAi" value="1" disabled={!aiAvailable} /> Rédaction assistée{!aiAvailable && ` (${aiReason})`}
      </label>
      <SubmitButton variant="dark" size="sm" pendingText="Rédaction…">
        Préparer
      </SubmitButton>
    </ActionForm>
  );
}

export type DraftView = {
  id: string;
  kind: DraftKind;
  status: DraftStatus;
  subject: string;
  body: string;
  generator: string;
  toEmail: string;
  approvedAt: string | null;
  sentAt: string | null;
  sentVia: string;
};

export function DraftCard({ leadId, draft, email, sendEnabled }: { leadId: string; draft: DraftView; email: string; sendEnabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const editable = draft.status === "DRAFT" || draft.status === "APPROVED";
  const to = draft.toEmail || email;
  const mailto = `mailto:${to}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;

  return (
    <div className="rounded-[10px] border border-line p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill tone={draft.status === "SENT" ? "green" : draft.status === "APPROVED" ? "blue" : draft.status === "DISCARDED" ? "slate" : "amber"}>
          {DRAFT_STATUS_LABELS[draft.status]}
        </Pill>
        <span className="text-sm font-bold">{DRAFT_KIND_LABELS[draft.kind]}</span>
        <span className="text-xs text-muted">
          {draft.generator === "template" ? "modèle" : draft.generator.replace("ai:", "rédaction assistée · ")}
          {draft.sentAt ? ` · envoyé le ${draft.sentAt}${draft.sentVia === "manual" ? " depuis votre messagerie" : ""}` : ""}
        </span>
      </div>

      {editable ? (
        <ActionForm action={updateDraftAction} hidden={{ leadId, draftId: draft.id }} className="space-y-2">
          <input name="subject" defaultValue={draft.subject} className="input font-semibold" maxLength={200} aria-label="Objet" />
          <textarea name="body" defaultValue={draft.body} rows={16} className="input font-mono text-xs leading-relaxed" aria-label="Corps" />
          <p className="text-xs text-muted">Modifier le texte annule l&apos;approbation : vous approuvez toujours le texte exact qui partira.</p>
          <SubmitButton variant="secondary" size="sm" pendingText="…">
            Enregistrer le texte
          </SubmitButton>
        </ActionForm>
      ) : (
        <div>
          <p className="font-semibold">{draft.subject}</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-2">{draft.body}</pre>
        </div>
      )}

      {editable && (
        <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-line pt-3">
          {draft.status === "DRAFT" && (
            <InlineAction action={approveDraftAction} hidden={{ leadId, draftId: draft.id }} variant="success">
              Approuver ce texte
            </InlineAction>
          )}
          {draft.status === "APPROVED" && (
            <>
              {sendEnabled && (
                <InlineAction action={sendDraftAction} hidden={{ leadId, draftId: draft.id }} variant="dark" confirm={`Envoyer ce message à ${to} ?`} pendingText="Envoi…">
                  Envoyer à {to}
                </InlineAction>
              )}
              <a href={mailto} className="btn btn-secondary btn-sm">
                Ouvrir dans ma messagerie
              </a>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`).then(() => setCopied(true));
                }}
              >
                {copied ? "Copié" : "Copier"}
              </button>
              <InlineAction action={markSentAction} hidden={{ leadId, draftId: draft.id }} confirm="Confirmez-vous avoir envoyé ce texte depuis votre messagerie ?">
                Marquer comme envoyé
              </InlineAction>
            </>
          )}
          <InlineAction action={discardDraftAction} hidden={{ leadId, draftId: draft.id }} variant="ghost">
            Abandonner
          </InlineAction>
        </div>
      )}
    </div>
  );
}

export function EraseForm({ leadId }: { leadId: string }) {
  return (
    <InlineAction
      action={eraseLeadAction}
      hidden={{ leadId }}
      variant="danger"
      confirm="Effacer définitivement ce prospect ? Sa fiche, son historique et ses messages seront supprimés ; seuls son email et son SIRET resteront dans la liste d'opposition."
    >
      Effacer ce prospect
    </InlineAction>
  );
}
