"use client";

import type { Role, WorkOrderStatus } from "@prisma/client";
import { Check, Copy, Link2, RefreshCw, Send, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { ActionForm, InlineAction, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/server/actions/helpers";
import { DecisionBadge, UrgencyBadge } from "@/components/status-badge";
import { Alert, Card, EmptyState, Field } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { ESTIMATE_STATUS_LABELS, URGENCY_LABELS, URGENCY_ORDER } from "@/lib/labels";
import { computeLine, formatEur, parseMoneyInput } from "@/lib/pricing";
import { hasPermission } from "@/lib/rbac";
import { isTerminal } from "@/lib/state-machine";
import { addEstimateLineAction, regenerateLinkAction, removeEstimateLineAction, reviseEstimateAction, sendEstimateAction, setLineDoneAction, type SendResult } from "@/server/actions/workorders";
import type { EstimateView, FindingView, LineView } from "../view-model";

const EDITABLE_STATUSES: WorkOrderStatus[] = ["ARRIVED", "WAITING_DIAGNOSIS", "DIAGNOSIS_IN_PROGRESS"];
const WORK_STATUSES: WorkOrderStatus[] = ["REPAIR_IN_PROGRESS", "QUALITY_CONTROL", "WAITING_PARTS"];

export function EstimateTab({
  workOrderId,
  status,
  estimates,
  findings,
  role,
  defaultVatRate,
}: {
  workOrderId: string;
  status: WorkOrderStatus;
  estimates: EstimateView[];
  findings: FindingView[];
  role: Role;
  defaultVatRate: string;
}) {
  const current = estimates[0];
  const canWrite = hasPermission(role, "estimate:write") && !isTerminal(status);
  const canSend = hasPermission(role, "estimate:send") && !isTerminal(status);
  const canAddLines = canWrite && EDITABLE_STATUSES.includes(status) && (!current || current.status === "DRAFT");
  const canTickWork = hasPermission(role, "repair:transition") && WORK_STATUSES.includes(status);
  // L'état du lien vit ici (et non dans le formulaire d'envoi, démonté dès que le statut change).
  const [sendState, sendAction] = useActionState<ActionState<SendResult>, FormData>(sendEstimateAction, { ok: false });
  const [regenState, regenAction] = useActionState<ActionState<SendResult>, FormData>(regenerateLinkAction, { ok: false });
  const link = [sendState, regenState]
    .filter((s) => s.ok && s.data)
    .sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))[0]?.data ?? null;

  return (
    <div className="grid gap-4">
      {link && <LinkPanel link={link} />}

      {current?.status === "DECIDED" && current.approval && (
        <Alert tone="ok" className="text-base">
          <p className="font-bold" data-testid="decision-banner">
            Décision du client reçue le {formatDateTime(current.approval.decidedAt)}
            {current.approval.customerName ? ` (signé ${current.approval.customerName})` : ""} : {current.totals.acceptedCount} accepté{current.totals.acceptedCount > 1 ? "s" : ""}, {current.totals.refusedCount} refusé
            {current.totals.refusedCount > 1 ? "s" : ""} · montant accepté {formatEur(current.totals.acceptedTtc)} TTC.
          </p>
          {current.approval.comment && <p className="mt-1 text-sm">Commentaire client : {current.approval.comment}</p>}
          <p className="mt-1 text-xs">Cette version est verrouillée et ne peut plus être modifiée.</p>
        </Alert>
      )}

      {current?.status === "SENT" && (
        <Alert tone="warn">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Estimation v{current.version} envoyée le {formatDateTime(current.sentAt)} · en attente de la décision du client.
              {current.activeToken ? ` Lien valable jusqu'au ${formatDateTime(current.activeToken.expiresAt)}.` : " Aucun lien actif."}
            </span>
            <div className="flex flex-wrap gap-2">
              {canSend && (
                <form action={regenAction} className="flex flex-col gap-1">
                  <input type="hidden" name="workOrderId" value={workOrderId} />
                  <input type="hidden" name="estimateId" value={current.id} />
                  <SubmitButton variant="secondary" size="sm" pendingText="…">
                    <Link2 className="h-4 w-4" /> Nouveau lien
                  </SubmitButton>
                  {!regenState.ok && regenState.error && <span className="text-xs font-medium text-danger">{regenState.error}</span>}
                </form>
              )}
              {canWrite && (
                <InlineAction action={reviseEstimateAction} hidden={{ workOrderId, estimateId: current.id }} variant="secondary" confirm="Créer une nouvelle version ? Le lien envoyé au client sera désactivé.">
                  <RefreshCw className="h-4 w-4" /> Réviser (nouvelle version)
                </InlineAction>
              )}
            </div>
          </div>
        </Alert>
      )}

      <Card
        title={current ? `Travaux proposés · estimation v${current.version} · ${ESTIMATE_STATUS_LABELS[current.status]}` : "Travaux proposés"}
        actions={
          current?.status === "DRAFT" && canSend && current.lines.length > 0 ? (
            <form action={sendAction} className="flex flex-col gap-1">
              <input type="hidden" name="workOrderId" value={workOrderId} />
              <SubmitButton variant="primary" pendingText="Envoi…" data-testid="send-estimate">
                <Send className="h-4 w-4" /> Envoyer au client
              </SubmitButton>
              {!sendState.ok && sendState.error && <span className="text-xs font-medium text-danger">{sendState.error}</span>}
            </form>
          ) : null
        }
      >
        {!current || current.lines.length === 0 ? (
          <EmptyState title="Aucune ligne de travaux" description={canAddLines ? "Ajoutez les interventions proposées à partir du diagnostic." : "Les travaux se proposent pendant le diagnostic."} />
        ) : (
          <LinesTable lines={current.lines} findings={findings} workOrderId={workOrderId} editable={current.status === "DRAFT" && canWrite} tickable={current.status === "DECIDED" && canTickWork} totals={current.totals} decided={current.status === "DECIDED"} />
        )}
        {canAddLines && <AddLineForm workOrderId={workOrderId} findings={findings} defaultVatRate={defaultVatRate} />}
      </Card>

      {estimates.length > 1 && (
        <Card title="Versions précédentes">
          <ul className="space-y-3">
            {estimates.slice(1).map((e) => (
              <li key={e.id} className="rounded-[10px] border border-line p-3">
                <p className="mb-2 text-sm font-bold">
                  v{e.version} · {ESTIMATE_STATUS_LABELS[e.status]}
                  {e.sentAt ? ` · envoyée le ${formatDateTime(e.sentAt)}` : ""}
                </p>
                <LinesTable lines={e.lines} findings={findings} workOrderId={workOrderId} editable={false} tickable={false} totals={e.totals} decided={e.status === "DECIDED"} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function LinkPanel({ link }: { link: SendResult }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert tone="info">
      <p className="font-bold">Lien de validation généré (valable jusqu&apos;au {formatDateTime(link.expiresAt)}).</p>
      <p className="text-xs">Transmettez-le au client par SMS ou email. Il n&apos;est affiché qu&apos;une seule fois : régénérez-le si besoin.</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input readOnly value={link.url} className="input min-h-10 flex-1 font-mono text-xs" data-testid="approval-link" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn btn-dark btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* presse-papiers indisponible : le champ reste sélectionnable */
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copié" : "Copier"}
        </button>
        <a href={link.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
          Ouvrir
        </a>
      </div>
    </Alert>
  );
}

function LinesTable({
  lines,
  findings,
  workOrderId,
  editable,
  tickable,
  totals,
  decided,
}: {
  lines: LineView[];
  findings: FindingView[];
  workOrderId: string;
  editable: boolean;
  tickable: boolean;
  totals: EstimateView["totals"];
  decided: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="estimate-lines">
        <thead className="text-left text-xs font-bold uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2 pr-3">Intervention</th>
            <th className="hidden py-2 pr-3 text-right md:table-cell">Pièces HT</th>
            <th className="hidden py-2 pr-3 text-right md:table-cell">MO HT</th>
            <th className="hidden py-2 pr-3 text-right md:table-cell">TVA</th>
            <th className="py-2 pr-3 text-right">TTC</th>
            <th className="py-2 pr-3">Urgence</th>
            {decided && <th className="py-2 pr-3">Client</th>}
            {(editable || tickable) && <th className="py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((l) => {
            const finding = findings.find((f) => f.id === l.findingId);
            return (
              <tr key={l.id} className={l.decision === "REFUSED" ? "text-muted" : ""}>
                <td className="py-2.5 pr-3">
                  <p className={`font-bold ${l.decision === "REFUSED" ? "line-through" : ""}`}>{l.title}</p>
                  {finding && <p className="text-xs text-muted">Constat : {finding.title}</p>}
                  {l.description && <p className="text-xs text-ink-2">{l.description}</p>}
                  {decided && l.decision === "ACCEPTED" && l.workStatus === "DONE" && <span className="badge mt-1 bg-ok-soft text-ok">Réalisé</span>}
                </td>
                <td className="hidden py-2.5 pr-3 text-right md:table-cell">{formatEur(l.partsPrice)}</td>
                <td className="hidden py-2.5 pr-3 text-right md:table-cell">{formatEur(l.laborPrice)}</td>
                <td className="hidden py-2.5 pr-3 text-right md:table-cell">
                  {formatEur(l.vatAmount)} <span className="text-xs text-muted">({Number(l.vatRate)} %)</span>
                </td>
                <td className="py-2.5 pr-3 text-right font-extrabold">{formatEur(l.totalTtc)}</td>
                <td className="py-2.5 pr-3">
                  <UrgencyBadge urgency={l.urgency} />
                </td>
                {decided && (
                  <td className="py-2.5 pr-3">
                    <DecisionBadge decision={l.decision} />
                  </td>
                )}
                {editable && (
                  <td className="py-2.5 text-right">
                    <InlineAction action={removeEstimateLineAction} hidden={{ workOrderId, lineId: l.id }} variant="danger" confirm="Retirer cette ligne ?">
                      <Trash2 className="h-4 w-4" />
                    </InlineAction>
                  </td>
                )}
                {tickable && (
                  <td className="py-2.5 text-right">
                    {l.decision === "ACCEPTED" && (
                      <InlineAction action={setLineDoneAction} hidden={{ workOrderId, lineId: l.id, done: l.workStatus === "DONE" ? "0" : "1" }} variant={l.workStatus === "DONE" ? "secondary" : "success"}>
                        {l.workStatus === "DONE" ? "Annuler" : <><Check className="h-4 w-4" /> Réalisé</>}
                      </InlineAction>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-line-strong font-semibold">
          <tr>
            <td className="py-2 pr-3" colSpan={decided ? 2 : 1}>
              Total HT {formatEur(totals.totalHt)} · TVA {formatEur(totals.vatAmount)}
            </td>
            <td className="hidden md:table-cell" colSpan={3} />
            <td className="py-2 pr-3 text-right text-base font-extrabold" colSpan={decided ? 3 : 4}>
              {decided ? (
                <>
                  Accepté : <span data-testid="accepted-total">{formatEur(totals.acceptedTtc)}</span> TTC
                  <span className="block text-xs font-medium text-muted">Refusé : {formatEur(totals.refusedTtc)} TTC</span>
                </>
              ) : (
                <>Total : {formatEur(totals.totalTtc)} TTC</>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function AddLineForm({ workOrderId, findings, defaultVatRate }: { workOrderId: string; findings: FindingView[]; defaultVatRate: string }) {
  const [parts, setParts] = useState("");
  const [labor, setLabor] = useState("");
  const [vat, setVat] = useState(defaultVatRate);
  const p = parseMoneyInput(parts || "0");
  const l = parseMoneyInput(labor || "0");
  const v = Number(vat.replace(",", "."));
  let preview = "";
  if (p && l && Number.isFinite(v) && v >= 0 && v <= 100) {
    const t = computeLine(p, l, v);
    preview = `${formatEur(t.totalHt)} HT · TVA ${formatEur(t.vatAmount)} · ${formatEur(t.totalTtc)} TTC`;
  }
  return (
    <ActionForm
      action={addEstimateLineAction}
      hidden={{ workOrderId }}
      className="mt-5 grid gap-3 rounded-[12px] bg-surface-2 p-3 sm:grid-cols-6"
      resetOnSuccess
      onSuccess={() => {
        setParts("");
        setLabor("");
      }}
    >
      {(state) => (
        <>
          <Field label="Titre" name="l-title" error={state.fields?.title} required className="sm:col-span-3">
            <input id="l-title" name="title" className="input" placeholder="Remplacement plaquettes avant" required />
          </Field>
          <Field label="Constat lié" name="l-findingId" error={state.fields?.findingId} className="sm:col-span-3">
            <select id="l-findingId" name="findingId" className="input" defaultValue="">
              <option value="">Aucun</option>
              {findings.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description" name="l-description" error={state.fields?.description} className="sm:col-span-6">
            <input id="l-description" name="description" className="input" placeholder="Détail pour le client (facultatif)" />
          </Field>
          <Field label="Pièces HT (€)" name="l-partsPrice" error={state.fields?.partsPrice}>
            <input id="l-partsPrice" name="partsPrice" inputMode="decimal" className="input" value={parts} onChange={(e) => setParts(e.target.value)} placeholder="0,00" />
          </Field>
          <Field label="Main-d'œuvre HT (€)" name="l-laborPrice" error={state.fields?.laborPrice}>
            <input id="l-laborPrice" name="laborPrice" inputMode="decimal" className="input" value={labor} onChange={(e) => setLabor(e.target.value)} placeholder="0,00" />
          </Field>
          <Field label="TVA (%)" name="l-vatRate" error={state.fields?.vatRate}>
            <input id="l-vatRate" name="vatRate" inputMode="decimal" className="input" value={vat} onChange={(e) => setVat(e.target.value)} />
          </Field>
          <Field label="Urgence" name="l-urgency" error={state.fields?.urgency} className="sm:col-span-2">
            <select id="l-urgency" name="urgency" className="input" defaultValue="RECOMMENDED">
              {URGENCY_ORDER.map((u) => (
                <option key={u} value={u}>
                  {URGENCY_LABELS[u]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <SubmitButton className="btn-block" pendingText="Ajout…" data-testid="add-line">
              Ajouter
            </SubmitButton>
          </div>
          {preview && <p className="text-sm font-semibold text-ink-2 sm:col-span-6">Aperçu : {preview}</p>}
        </>
      )}
    </ActionForm>
  );
}
