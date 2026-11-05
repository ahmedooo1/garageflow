"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui";
import { CARTE_GRISE_FIELDS, CARTE_GRISE_LABELS, carteGriseToForm, confidenceLevel, type CarteGriseField, type ExtractedField } from "@/lib/carte-grise";
import type { ScanResult } from "@/lib/carte-grise-ocr";

type Review = { values: Record<CarteGriseField, string>; meta: Partial<Record<CarteGriseField, ExtractedField>>; orientation: number; durationMs: number; read: number };

const ERRORS: Record<string, string> = {
  type: "Ce fichier n'est pas une image. Prenez une photo de la carte grise ou choisissez une image.",
  taille: "Image trop lourde (15 Mo au plus). Reprenez la photo.",
  image: "Cette image ne peut pas être ouverte sur cet appareil. Essayez une photo au format JPEG ou PNG.",
  moteur: "Le module de lecture n'a pas pu démarrer sur cet appareil. Saisissez les informations manuellement.",
};

function level(m: ExtractedField | undefined): { label: string; tone: string } {
  const l = confidenceLevel(m);
  if (l === "non_lu" || !m) return { label: "Non lu", tone: "bg-surface-2 text-muted" };
  return l === "fiable" ? { label: `Fiable · ${m.confidence} %`, tone: "bg-ok-soft text-ok" } : { label: `À vérifier · ${m.confidence} %`, tone: "bg-warn-soft text-warn" };
}

/**
 * Lecture de la carte grise sur l'appareil. Les champs de saisie de cet écran
 * n'ont pas d'attribut `name` : rien n'est envoyé avec le formulaire avant
 * « Reporter dans le formulaire », et l'image n'est jamais envoyée.
 */
export function CarteGriseScan() {
  const root = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [applied, setApplied] = useState(false);
  const [origin, setOrigin] = useState("");

  async function onFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Le fichier n'est gardé que le temps de la lecture.
    input.value = "";
    if (!file) return;
    setError(null);
    setReview(null);
    setApplied(false);
    setBusy("Préparation…");
    try {
      const { scanCarteGrise } = await import("@/lib/carte-grise-ocr");
      const res: ScanResult = await scanCarteGrise(file, (step, ratio) =>
        setBusy(step === "chargement" ? `Chargement du module de lecture… ${Math.round(ratio * 100)} %` : `Lecture de la carte grise… ${Math.round(ratio * 100)} %`),
      );
      const { fields } = res.extraction;
      if (res.extraction.score < 2) {
        setError("La carte grise n'a pas pu être lue. Reprenez la photo à plat, bien éclairée et sans reflet, ou saisissez les informations manuellement.");
        return;
      }
      const values = Object.fromEntries(CARTE_GRISE_FIELDS.map((k) => [k, fields[k]?.value ?? ""])) as Record<CarteGriseField, string>;
      setReview({ values, meta: fields, orientation: res.orientation, durationMs: res.durationMs, read: res.extraction.score });
    } catch (e) {
      const code = e instanceof Error && e.name === "ScanError" ? e.message : "moteur";
      setError(ERRORS[code] ?? ERRORS.moteur);
    } finally {
      setBusy(null);
    }
  }

  function apply() {
    if (!review) return;
    const form = root.current?.closest("form");
    if (!form) return;
    const values = Object.fromEntries(Object.entries(review.values).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) as Partial<Record<CarteGriseField, string>>;
    for (const [name, value] of Object.entries(carteGriseToForm(values))) {
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = value;
    }
    setOrigin("carte_grise");
    setApplied(true);
    setReview(null);
  }

  return (
    <div ref={root} className="space-y-3 rounded-[10px] border border-line p-4">
      <input type="hidden" name="technicalOrigin" value={origin} readOnly />
      <div>
        <p className="font-bold text-ink">Lire la carte grise</p>
        <p className="text-sm text-muted">
          Carte à plat, bien éclairée, sans reflet. La photo reste sur cet appareil : elle n&apos;est ni envoyée ni conservée. Le nom et
          l&apos;adresse du titulaire ne sont jamais lus.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className={`btn btn-secondary w-full sm:w-auto ${busy ? "pointer-events-none opacity-60" : ""}`}>
          Photographier la carte grise
          <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Photographier la carte grise" disabled={!!busy} onChange={(e) => onFile(e.currentTarget)} />
        </label>
        <label className={`btn btn-ghost w-full sm:w-auto ${busy ? "pointer-events-none opacity-60" : ""}`}>
          Importer une image
          <input type="file" accept="image/*" className="sr-only" aria-label="Importer une image de carte grise" disabled={!!busy} onChange={(e) => onFile(e.currentTarget)} />
        </label>
      </div>

      {busy && (
        <p className="text-sm font-medium text-ink" role="status">
          {busy}
        </p>
      )}
      {error && <Alert tone="warn">{error}</Alert>}
      {applied && <Alert tone="ok">Informations de la carte grise reprises dans le formulaire. Vérifiez-les avant d&apos;enregistrer.</Alert>}

      {review && (
        <div role="region" aria-label="Lecture de la carte grise" className="space-y-3">
          <p className="text-sm text-muted">
            {review.read} rubrique{review.read > 1 ? "s" : ""} lue{review.read > 1 ? "s" : ""} sur {CARTE_GRISE_FIELDS.length}
            {review.orientation ? `, photo retournée de ${review.orientation}°` : ""}. Comparez chaque valeur à la carte et corrigez si besoin.
          </p>
          <div className="divide-y divide-line rounded-[10px] border border-line">
            {CARTE_GRISE_FIELDS.map((k) => {
              const m = review.meta[k];
              const lv = level(m);
              return (
                <div key={k} className="grid grid-cols-[3.2rem_1fr] items-start gap-x-3 gap-y-1 p-2 sm:grid-cols-[3.2rem_11rem_1fr]">
                  <span className="pt-2 font-mono text-sm font-bold text-ink">{k}</span>
                  <label htmlFor={`cg-${k}`} className="pt-2 text-sm text-muted">
                    {CARTE_GRISE_LABELS[k]}
                  </label>
                  <div className="col-span-2 space-y-1 sm:col-span-1">
                    <input
                      id={`cg-${k}`}
                      aria-label={`${k} ${CARTE_GRISE_LABELS[k]}`}
                      className="input w-full font-mono"
                      value={review.values[k]}
                      placeholder={m ? "" : "Non lu : saisir si besoin"}
                      onChange={(e) => setReview({ ...review, values: { ...review.values, [k]: e.target.value } })}
                    />
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${lv.tone}`} data-testid={`cg-niveau-${k}`}>
                      {lv.label}
                      {m?.method === "motif" ? " · trouvé hors rubrique" : ""}
                      {m?.corrected ? " · corrigé" : ""}
                      {m?.ambiguous ? " · O/0 ou I/1 à vérifier" : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={apply}>
              Reporter dans le formulaire
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReview(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
