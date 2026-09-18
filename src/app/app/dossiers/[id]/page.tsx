import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { Alert, Plate } from "@/components/ui";
import { formatKm, formatShort, fullName } from "@/lib/format";
import { requireUser } from "@/server/context";
import { NotFoundError } from "@/server/lib/errors";
import { toPhotoViews } from "@/server/services/photos";
import { listTechnicians } from "@/server/services/users";
import { getWorkOrderDetail } from "@/server/services/workorders";
import { HeaderActions } from "./header-actions";
import { DeliveryTab } from "./tabs/delivery";
import { DiagnosisTab } from "./tabs/diagnosis";
import { EstimateTab } from "./tabs/estimate";
import { OverviewTab } from "./tabs/overview";
import { PhotosTab } from "./tabs/photos";
import { TimelineTab } from "./tabs/timeline";
import { toChecklistViews, toDamageViews, toEstimateViews, toFindingViews } from "./view-model";

export const metadata: Metadata = { title: "Dossier" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Résumé" },
  { key: "photos", label: "État & photos" },
  { key: "diagnosis", label: "Diagnostic" },
  { key: "estimate", label: "Travaux & validation" },
  { key: "delivery", label: "Restitution" },
  { key: "timeline", label: "Timeline" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function WorkOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; new?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx, user } = await requireUser();
  const wo = await getWorkOrderDetail(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "overview") as TabKey;
  const [photos, technicians] = await Promise.all([toPhotoViews(wo.photos), listTechnicians(ctx)]);
  const estimates = toEstimateViews(wo);
  const findings = toFindingViews(wo);
  const checklist = toChecklistViews(wo);
  const damages = toDamageViews(wo);
  const base = `/app/dossiers/${wo.id}`;
  const counts: Record<TabKey, number | null> = {
    overview: null,
    photos: photos.length,
    diagnosis: findings.length,
    estimate: estimates[0]?.lines.length ?? 0,
    delivery: null,
    timeline: wo.events.length,
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="card mb-4 overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/app/atelier" className="text-sm font-semibold text-muted hover:text-ink">
                ← Atelier
              </Link>
              <span className="text-sm font-bold text-muted">{wo.number}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Plate plate={wo.vehicle.plate} className="text-lg" />
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                {wo.vehicle.make} {wo.vehicle.model}
              </h1>
              <StatusBadge status={wo.status} size="lg" />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted">Client</dt>
                <dd>
                  <Link href={`/app/clients/${wo.customer.id}`} className="font-semibold text-accent hover:underline">
                    {fullName(wo.customer)}
                  </Link>
                  {wo.customer.phone && (
                    <a href={`tel:${wo.customer.phone}`} className="block text-ink-2">
                      {wo.customer.phone}
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted">Kilométrage</dt>
                <dd className="font-semibold">{formatKm(wo.mileageIn)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted">Technicien</dt>
                <dd className="font-semibold">{wo.technician ? fullName(wo.technician) : <span className="text-muted">Non assigné</span>}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted">Restitution prévue</dt>
                <dd className="font-semibold">{formatShort(wo.promisedAt)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm">
              <span className="font-bold">Motif :</span> {wo.reason}
            </p>
          </div>
          <HeaderActions workOrderId={wo.id} status={wo.status} role={user.role} technicianId={wo.technicianId} technicians={technicians} hasFinalCheck={Boolean(wo.finalCheck)} />
        </div>
        <nav className="scrollbar-thin flex overflow-x-auto border-t border-line bg-surface-2 px-2" aria-label="Sections du dossier">
          {TABS.map((t) => (
            <Link key={t.key} href={`${base}?tab=${t.key}`} className="tab-link" aria-current={tab === t.key ? "page" : undefined} data-testid={`tab-${t.key}`}>
              {t.label}
              {counts[t.key] !== null && counts[t.key]! > 0 && <span className="rounded-full bg-line px-1.5 text-xs">{counts[t.key]}</span>}
            </Link>
          ))}
        </nav>
      </header>

      {sp.new === "1" && tab === "photos" && (
        <Alert tone="ok" className="mb-4">
          Dossier {wo.number} créé. Ajoutez maintenant les photos d&apos;état du véhicule (avant, arrière, côtés, intérieur, tableau de bord) et les dommages existants.
        </Alert>
      )}

      {tab === "overview" && <OverviewTab wo={wo} photos={photos} estimates={estimates} findings={findings} />}
      {tab === "photos" && <PhotosTab workOrderId={wo.id} status={wo.status} photos={photos} damages={damages} role={user.role} />}
      {tab === "diagnosis" && <DiagnosisTab workOrderId={wo.id} status={wo.status} findings={findings} checklist={checklist} photos={photos} role={user.role} />}
      {tab === "estimate" && <EstimateTab workOrderId={wo.id} status={wo.status} estimates={estimates} findings={findings} role={user.role} defaultVatRate={wo.garage.vatRate.toString()} />}
      {tab === "delivery" && <DeliveryTab wo={wo} estimates={estimates} role={user.role} />}
      {tab === "timeline" && <TimelineTab events={wo.events} />}
    </div>
  );
}
