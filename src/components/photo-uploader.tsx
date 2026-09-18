"use client";

import type { PhotoType } from "@prisma/client";
import { Camera, ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PHOTO_TYPE_LABELS } from "@/lib/labels";

type Props = {
  workOrderId: string;
  /** Types proposés dans le sélecteur ; s'il n'y en a qu'un, il est imposé. */
  types: PhotoType[];
  defaultType?: PhotoType;
  findingId?: string;
  damageId?: string;
  checklistId?: string;
  compact?: boolean;
  disabled?: boolean;
};

export function PhotoUploader({ workOrderId, types, defaultType, findingId, damageId, checklistId, compact, disabled }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<PhotoType>(defaultType ?? types[0]);
  const [comment, setComment] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const list = Array.from(files);
    let done = 0;
    for (const file of list) {
      setProgress(`Envoi ${done + 1}/${list.length}…`);
      const form = new FormData();
      form.set("file", file);
      form.set("workOrderId", workOrderId);
      form.set("type", type);
      form.set("comment", comment);
      if (findingId) form.set("findingId", findingId);
      if (damageId) form.set("damageId", damageId);
      if (checklistId) form.set("checklistId", checklistId);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(json.error ?? "Échec de l'envoi");
          break;
        }
        done += 1;
      } catch {
        setError("Réseau indisponible : photo non envoyée");
        break;
      }
    }
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    setComment("");
    if (done > 0) router.refresh();
  }

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-3 rounded-[12px] border border-dashed border-line-strong bg-surface-2 p-3 sm:p-4"}>
      {!compact && (
        <div className="grid gap-3 sm:grid-cols-2">
          {types.length > 1 ? (
            <div>
              <label className="field-label" htmlFor={`photo-type-${findingId ?? damageId ?? "main"}`}>
                Type de photo
              </label>
              <select id={`photo-type-${findingId ?? damageId ?? "main"}`} className="input" value={type} onChange={(e) => setType(e.target.value as PhotoType)}>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {PHOTO_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm font-semibold">{PHOTO_TYPE_LABELS[type]}</p>
          )}
          <div>
            <label className="field-label" htmlFor={`photo-comment-${findingId ?? damageId ?? "main"}`}>
              Commentaire
            </label>
            <input id={`photo-comment-${findingId ?? damageId ?? "main"}`} className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Facultatif" maxLength={500} />
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="sr-only"
        onChange={(e) => upload(e.target.files)}
        disabled={disabled || progress !== null}
        data-testid={`photo-input-${findingId ?? damageId ?? checklistId ?? "main"}`}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`btn ${compact ? "btn-secondary btn-sm" : "btn-primary btn-lg"}`} onClick={() => inputRef.current?.click()} disabled={disabled || progress !== null}>
          {compact ? <Camera className="h-4 w-4" /> : <ImagePlus className="h-5 w-5" />}
          {progress ?? (compact ? "Photo" : "Ajouter des photos")}
        </button>
        {!compact && <p className="self-center text-xs text-muted">JPEG, PNG, WebP · 10 Mo max · plusieurs fichiers possibles · appareil photo sur mobile</p>}
      </div>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
