import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { UrgencyBadge } from "@/components/status-badge";
import { Plate } from "@/components/ui";
import { formatDateTime, formatKm } from "@/lib/format";
import { PHOTO_TYPE_LABELS } from "@/lib/labels";
import { formatEur } from "@/lib/pricing";
import { isAppError } from "@/server/lib/errors";
import { getClientIp } from "@/server/lib/request";
import { getPortalData } from "@/server/services/approvals";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Validation des travaux", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: Awaited<ReturnType<typeof getPortalData>>;
  try {
    data = await getPortalData(token, await getClientIp());
  } catch (e) {
    return (
      <Shell>
        <div className="card p-6 text-center">
          <h1 className="text-xl font-extrabold">Lien invalide ou expiré</h1>
          <p className="mt-2 text-muted">{isAppError(e) ? e.message : "Ce lien n'est plus valable."} Contactez votre garage pour recevoir un nouveau lien.</p>
        </div>
      </Shell>
    );
  }

  const decided = data.estimate.status === "DECIDED" || data.estimate.approval !== null;
  const conditionPhotos = data.photos.filter((p) => p.type !== "FINDING");

  return (
    <Shell garage={data.garage}>
      <header className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Proposition de travaux · dossier {data.workOrderNumber}</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">
          Bonjour {data.customer.firstName} {data.customer.lastName}
        </h1>
        <p className="mt-1 text-ink-2">
          Votre {data.vehicle.make} {data.vehicle.model} <Plate plate={data.vehicle.plate} className="ml-1 text-xs" /> · {formatKm(data.mileageIn)}
        </p>
        <p className="mt-1 text-sm text-muted">Motif de la visite : {data.reason}</p>
      </header>

      {data.findings.length > 0 && (
        <section className="card mb-4 p-4 sm:p-5">
          <h2 className="mb-3 text-lg font-bold">Diagnostic du technicien</h2>
          <ul className="space-y-3">
            {data.findings.map((f) => {
              const photos = data.photos.filter((p) => p.findingId === f.id);
              return (
                <li key={f.id} className="rounded-[10px] border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{f.title}</p>
                    <UrgencyBadge urgency={f.urgency} />
                  </div>
                  <p className="text-xs font-semibold text-muted">{f.category}</p>
                  {f.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{f.description}</p>}
                  {photos.length > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto">
                      {photos.map((p) => (
                        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={p.comment || f.title} className="h-24 w-32 rounded-md object-cover" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card mb-4 p-4 sm:p-5">
        <h2 className="mb-1 text-lg font-bold">Travaux proposés</h2>
        <p className="mb-4 text-sm text-muted">
          Estimation v{data.estimate.version} envoyée le {formatDateTime(data.estimate.sentAt)}. Vous pouvez accepter ou refuser chaque intervention indépendamment.
        </p>
        {decided ? (
          <DecidedSummary data={data} />
        ) : (
          <DecisionForm token={token} lines={data.estimate.lines} totalTtc={data.estimate.totals.totalTtc} expiresAt={data.expiresAt.toISOString()} />
        )}
      </section>

      {conditionPhotos.length > 0 && (
        <section className="card mb-4 p-4 sm:p-5">
          <h2 className="mb-3 text-lg font-bold">État du véhicule à la réception</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {conditionPhotos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={PHOTO_TYPE_LABELS[p.type]} className="aspect-[4/3] w-full rounded-md object-cover" loading="lazy" />
                <span className="mt-1 block text-xs font-semibold text-muted">{PHOTO_TYPE_LABELS[p.type]}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}

function DecidedSummary({ data }: { data: Awaited<ReturnType<typeof getPortalData>> }) {
  const accepted = data.estimate.lines.filter((l) => l.decision === "ACCEPTED");
  const refused = data.estimate.lines.filter((l) => l.decision === "REFUSED");
  return (
    <div data-testid="portal-decided">
      <div className="rounded-[10px] bg-ok-soft p-4 text-ok">
        <p className="font-bold">Merci, votre réponse a bien été enregistrée le {formatDateTime(data.estimate.approval?.decidedAt ?? data.estimate.decidedAt)}.</p>
        <p className="text-sm">Le garage va poursuivre l&apos;intervention selon vos choix. Cette proposition ne peut plus être modifiée.</p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-ok">Accepté</h3>
          {accepted.length === 0 ? <p className="text-sm text-muted">Aucune intervention</p> : <LineList lines={accepted} />}
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-danger">Refusé</h3>
          {refused.length === 0 ? <p className="text-sm text-muted">Aucune intervention</p> : <LineList lines={refused} />}
        </div>
      </div>
      <p className="mt-4 text-lg font-extrabold">Montant accepté : {formatEur(data.estimate.totals.acceptedTtc)} TTC</p>
    </div>
  );
}

function LineList({ lines }: { lines: { id: string; title: string; totalTtc: string }[] }) {
  return (
    <ul className="mt-1 divide-y divide-line">
      {lines.map((l) => (
        <li key={l.id} className="flex justify-between py-1.5 text-sm">
          <span>{l.title}</span>
          <span className="font-semibold">{formatEur(l.totalTtc)}</span>
        </li>
      ))}
    </ul>
  );
}

function Shell({ children, garage }: { children: React.ReactNode; garage?: { name: string; address: string; phone: string; email: string } }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="bg-steel-900 px-4 py-4 text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Logo light compact />
          {garage && (
            <div className="text-right">
              <p className="font-bold">{garage.name}</p>
              <p className="text-xs text-steel-300">
                {garage.phone && (
                  <a href={`tel:${garage.phone}`} className="hover:text-white">
                    {garage.phone}
                  </a>
                )}
                {garage.phone && garage.address ? " · " : ""}
                {garage.address}
              </p>
            </div>
          )}
        </div>
      </div>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      <footer className="px-4 pb-8 text-center text-xs text-muted">Lien personnel et confidentiel. Ne le partagez pas.</footer>
    </div>
  );
}
