import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Card, KV, PageHeader, Pill } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { CONFIDENCE_LABELS, LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, LEAD_STAGE_TONES, workforceLabel } from "@/lib/growth/labels";
import type { Evidence, WebsiteSignals } from "@/lib/growth/scoring";
import { zoneLabel } from "@/lib/growth/zones";
import { isAppError } from "@/server/lib/errors";
import { aiAvailability } from "@/server/growth/ai";
import { getLead } from "@/server/growth/leads";
import { sendingEnabled } from "@/server/growth/outreach";
import { missingSenderFields } from "@/server/growth/settings";
import { ContactForm, DraftCard, FollowUpForm, NewDraftForm, NoteForm, ReplyForm, StageForm } from "./lead-forms";

export const metadata: Metadata = { title: "Prospect", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-info underline underline-offset-2">
      {children}
    </a>
  );
}

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let lead: Awaited<ReturnType<typeof getLead>>;
  try {
    lead = await getLead(id);
  } catch (e) {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  }
  const evidence = (lead.scoreEvidence as Evidence[] | null) ?? [];
  const signals = lead.websiteSignals as WebsiteSignals | null;
  const ai = await aiAvailability();
  const missing = missingSenderFields();
  const openDraft = lead.drafts.some((d) => d.status === "DRAFT" || d.status === "APPROVED");

  return (
    <>
      <PageHeader
        title={lead.name}
        back={{ href: "/admin/prospects", label: "Prospects" }}
        subtitle={[lead.address, [lead.postalCode, lead.city].filter(Boolean).join(" "), zoneLabel(lead.zone)].filter(Boolean).join(" · ")}
        actions={
          <>
            <Pill tone={LEAD_STAGE_TONES[lead.stage]} size="lg">
              {LEAD_STAGE_LABELS[lead.stage]}
            </Pill>
            <Pill tone="slate" size="lg">
              {lead.score}/100 · confiance {CONFIDENCE_LABELS[lead.confidence].toLowerCase()}
            </Pill>
          </>
        }
      />

      {lead.optedOutAt && (
        <Alert tone="danger" className="mb-4">
          Ce garage s&apos;est opposé à la prospection le {formatDate(lead.optedOutAt)}. Aucun message ne peut lui être préparé ni envoyé.
        </Alert>
      )}
      {lead.demoRequestedAt && (
        <Alert tone="info" className="mb-4">
          Démonstration demandée le {formatDateTime(lead.demoRequestedAt)}
          {lead.demoMessage ? ` : « ${lead.demoMessage} »` : "."}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card title="Faits et sources">
            <KV
              items={[
                { label: "Source", value: <SourceLink href={lead.sourceUrl}>{LEAD_SOURCE_LABELS[lead.source]}</SourceLink> },
                { label: "Relevé le", value: formatDate(lead.sourceFetchedAt) },
                { label: "SIRET", value: lead.siret ?? "-" },
                { label: "Code NAF", value: lead.nafCode || "-" },
                { label: "Effectif déclaré", value: lead.workforceRange ? workforceLabel(lead.workforceRange) : "-" },
                { label: "Établissements ouverts", value: lead.establishmentsCount ?? "-" },
                { label: "Création", value: lead.companyCreatedOn ? formatDate(lead.companyCreatedOn) : "-" },
                { label: "Site web", value: lead.website ? <SourceLink href={lead.website}>{lead.website.replace(/^https?:\/\//, "")}</SourceLink> : "-" },
                { label: "Site vérifié", value: lead.websiteCheckedAt ? `${formatDate(lead.websiteCheckedAt)}${signals?.reachable ? "" : " (injoignable)"}` : "-" },
              ]}
            />
            {lead.garage && (
              <p className="mt-4 text-sm">
                Inscrit comme <strong>{lead.garage.name}</strong> le {formatDate(lead.garage.createdAt)} ({lead.garage.subscriptionStatus}).
              </p>
            )}
          </Card>

          <Card title="Qualification">
            <p className="text-sm leading-relaxed text-ink-2">{lead.hypothesis || "Pas encore qualifié."}</p>
            <ul className="mt-4 divide-y divide-line text-sm">
              {evidence.map((e) => (
                <li key={e.key} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="font-semibold">{e.label}</p>
                    <p className="text-muted">
                      {e.evidence} · <SourceLink href={e.sourceUrl}>source</SourceLink> · {formatDate(new Date(e.observedAt))}
                    </p>
                  </div>
                  <span className={`shrink-0 font-bold tabular-nums ${e.points < 0 ? "text-danger" : e.points > 0 ? "text-ok" : "text-muted"}`}>
                    {e.points > 0 ? `+${e.points}` : e.points}
                  </span>
                </li>
              ))}
            </ul>
            {lead.scoredAt && <p className="mt-2 text-xs text-muted">Calculé le {formatDateTime(lead.scoredAt)}, à partir des seuls faits ci-dessus.</p>}
          </Card>

          <Card title="Messages">
            {missing.length > 0 && (
              <Alert tone="warn" className="mb-3">
                Identité de l&apos;expéditeur incomplète ({missing.join(", ")}) : les brouillons peuvent être préparés mais pas approuvés.
              </Alert>
            )}
            {!openDraft && !lead.optedOutAt && (
              <div className="mb-4">
                <NewDraftForm
                  leadId={lead.id}
                  aiAvailable={ai.available}
                  aiReason={ai.available ? "" : ai.reason}
                  defaultKind={lead.drafts.some((d) => d.status === "SENT") ? "FOLLOW_UP" : lead.demoRequestedAt ? "DEMO_INVITE" : "FIRST_CONTACT"}
                />
              </div>
            )}
            <div className="space-y-3">
              {lead.drafts.length === 0 && <p className="text-sm text-muted">Aucun message préparé.</p>}
              {lead.drafts.map((d) => (
                <DraftCard
                  key={d.id}
                  leadId={lead.id}
                  email={lead.email}
                  sendEnabled={sendingEnabled()}
                  draft={{
                    id: d.id,
                    kind: d.kind,
                    status: d.status,
                    subject: d.subject,
                    body: d.body,
                    generator: d.generator,
                    toEmail: d.toEmail,
                    approvedAt: d.approvedAt ? formatDateTime(d.approvedAt) : null,
                    sentAt: d.sentAt ? formatDateTime(d.sentAt) : null,
                    sentVia: d.sentVia,
                  }}
                />
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Coordonnées">
            <ContactForm
              leadId={lead.id}
              inbound={lead.source === "INBOUND_DEMO"}
              contact={{ website: lead.website, email: lead.email, emailSourceUrl: lead.emailSourceUrl, phone: lead.phone, phoneSourceUrl: lead.phoneSourceUrl, contactName: lead.contactName }}
            />
          </Card>
          <Card title="Suivi">
            <div className="space-y-5">
              <StageForm leadId={lead.id} stage={lead.stage} />
              <FollowUpForm leadId={lead.id} value={lead.nextFollowUpAt ? lead.nextFollowUpAt.toISOString().slice(0, 10) : ""} />
              <div>
                <p className="field-label">Réponse reçue</p>
                <ReplyForm leadId={lead.id} />
              </div>
              {lead.objection && <p className="text-sm">Objection : {lead.objection}</p>}
            </div>
          </Card>
          <Card title="Historique">
            <NoteForm leadId={lead.id} />
            <ol className="mt-4 space-y-3 text-sm">
              {lead.activities.map((a) => (
                <li key={a.id}>
                  <p className="text-ink-2">{a.message}</p>
                  <p className="text-xs text-muted">{formatDateTime(a.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
