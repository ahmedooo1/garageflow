"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui";
import { FUEL_LABELS } from "@/lib/labels";
import { kwToHp, TECHNICAL_FIELD_LABELS, type VehicleTechnicalData } from "@/lib/plate";
import { lookupPlateAction } from "@/server/actions/vehicles";
import type { PlateLookupResult } from "@/server/plate-lookup/service";

type Found = Extract<PlateLookupResult, { status: "found" }>;

function frDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function rows(data: VehicleTechnicalData): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null) => value && out.push({ label, value });
  push("Véhicule", [data.make, data.model].filter(Boolean).join(" ") || null);
  push(TECHNICAL_FIELD_LABELS.version, data.version || null);
  push(TECHNICAL_FIELD_LABELS.firstRegistrationDate, data.firstRegistrationDate ? frDate(data.firstRegistrationDate) : null);
  if (!data.firstRegistrationDate) push(TECHNICAL_FIELD_LABELS.year, data.year ? String(data.year) : null);
  push(TECHNICAL_FIELD_LABELS.fuel, data.fuel ? FUEL_LABELS[data.fuel] : data.fuelLabel ? `${data.fuelLabel} (à préciser)` : null);
  push(TECHNICAL_FIELD_LABELS.engine, data.engine || null);
  push(TECHNICAL_FIELD_LABELS.powerKw, data.powerKw ? `${data.powerKw} kW (${kwToHp(data.powerKw)} ch)` : null);
  push(TECHNICAL_FIELD_LABELS.fiscalPower, data.fiscalPower ? `${data.fiscalPower} CV` : null);
  push(TECHNICAL_FIELD_LABELS.gearbox, data.gearbox || null);
  push(TECHNICAL_FIELD_LABELS.vin, data.vin || null);
  return out;
}

/** Valeurs à reporter dans le formulaire : uniquement les champs fournis. */
function formValues(data: VehicleTechnicalData): Record<string, string> {
  const v: Record<string, string> = {};
  if (data.make) v.make = data.make;
  if (data.model) v.model = data.model;
  if (data.version) v.version = data.version;
  if (data.vin) v.vin = data.vin;
  if (data.year) v.year = String(data.year);
  if (data.fuel) v.fuel = data.fuel;
  if (data.engine) v.engine = data.engine;
  if (data.firstRegistrationDate) v.firstRegistrationDate = data.firstRegistrationDate;
  if (data.powerKw) v.powerKw = String(data.powerKw);
  if (data.fiscalPower) v.fiscalPower = String(data.fiscalPower);
  if (data.gearbox) v.gearbox = data.gearbox;
  return v;
}

/**
 * Bouton « Rechercher » à côté du champ immatriculation. Rien n'est écrit
 * dans le formulaire sans clic sur « Utiliser ces informations », et tous les
 * champs restent modifiables : la saisie manuelle est toujours possible.
 */
export function PlateLookup({ plateInputId = "plate" }: { plateInputId?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PlateLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  // Champ contrôlé : React réécrit la valeur d'un champ caché non contrôlé à chaque rendu.
  const [lookupId, setLookupId] = useState("");

  const form = () => root.current?.closest("form") ?? null;

  function search() {
    const plate = (document.getElementById(plateInputId) as HTMLInputElement | null)?.value ?? "";
    setError(null);
    setResult(null);
    setApplied(null);
    setLookupId("");
    if (!plate.trim()) {
      setError("Saisissez d'abord l'immatriculation.");
      return;
    }
    start(async () => {
      const res = await lookupPlateAction(plate);
      if (!res.ok || !res.data) setError(res.error ?? "La recherche a échoué. Saisissez les informations manuellement.");
      else setResult(res.data);
    });
  }

  function apply(found: Found) {
    const f = form();
    if (!f) return;
    for (const [name, value] of Object.entries(formValues(found.data))) {
      const el = f.elements.namedItem(name);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = value;
    }
    setLookupId(found.lookupId);
    setApplied(found.plate);
    setResult(null);
  }

  return (
    <div ref={root} className="space-y-3">
      <input type="hidden" name="plateLookupId" value={lookupId} readOnly />
      <button type="button" className="btn btn-secondary w-full sm:w-auto" onClick={search} disabled={pending}>
        {pending ? "Recherche…" : "Rechercher les caractéristiques"}
      </button>

      {error && <Alert tone="warn">{error}</Alert>}

      {applied && (
        <Alert tone="ok">Informations de {applied} reprises dans le formulaire. Vérifiez-les et complétez avant d&apos;enregistrer.</Alert>
      )}

      {result?.status === "exists" && (
        <Alert tone="info">
          Le véhicule {result.plate} est déjà enregistré dans votre garage.{" "}
          <Link href={`/app/vehicules/${result.vehicleId}`} className="font-semibold underline">
            Ouvrir la fiche
          </Link>
        </Alert>
      )}

      {result?.status === "not_found" && (
        <Alert tone="info">Aucune donnée trouvée pour {result.plate}. Saisissez les informations manuellement.</Alert>
      )}

      {result?.status === "found" && (
        <div className="rounded-[10px] border-2 border-accent bg-accent-soft p-4" role="region" aria-label="Véhicule identifié">
          <p className="font-bold text-ink">Véhicule identifié : {result.plate}</p>
          <p className="mb-3 text-sm text-muted">Vérifiez ces informations avec la carte grise avant de les utiliser.</p>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            {rows(result.data).map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-muted">{r.label}</dt>
                <dd className="font-medium text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
          {result.missing.length > 0 && (
            <p className="mt-3 text-sm text-muted">
              Non fournis : {result.missing.map((k) => TECHNICAL_FIELD_LABELS[k as keyof typeof TECHNICAL_FIELD_LABELS] ?? k).join(", ")}. À compléter si besoin.
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            Source : {result.source}
            {result.fromCache ? " · résultat déjà consulté, non décompté" : ""} · recherches ce mois-ci : {result.quota.used} / {result.quota.limit}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => apply(result)}>
              Utiliser ces informations
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>
              Ignorer et saisir manuellement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
