"use client";

import { Trash2 } from "lucide-react";
import { InlineAction } from "@/components/forms";
import { formatDateTime } from "@/lib/format";
import { PHOTO_TYPE_LABELS } from "@/lib/labels";
import { deletePhotoAction } from "@/server/actions/workorders";
import type { PhotoView } from "@/server/services/photos";

export function PhotoGallery({ photos, workOrderId, canDelete, small }: { photos: PhotoView[]; workOrderId: string; canDelete: boolean; small?: boolean }) {
  if (photos.length === 0) return null;
  return (
    <ul className={`grid gap-2 ${small ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`} data-testid="photo-gallery">
      {photos.map((p) => (
        <li key={p.id} className="group relative overflow-hidden rounded-[10px] border border-line bg-surface">
          <a href={p.url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.comment || PHOTO_TYPE_LABELS[p.type]} className="aspect-[4/3] w-full object-cover" loading="lazy" />
          </a>
          <div className="p-2">
            <p className="text-xs font-bold">{PHOTO_TYPE_LABELS[p.type]}</p>
            {p.comment && !small && <p className="line-clamp-2 text-xs text-ink-2">{p.comment}</p>}
            {!small && (
              <p className="text-[11px] text-muted">
                {formatDateTime(p.createdAt)}
                {p.authorName ? ` · ${p.authorName}` : ""}
              </p>
            )}
          </div>
          {canDelete && (
            <div className="absolute right-1 top-1">
              <InlineAction action={deletePhotoAction} hidden={{ workOrderId, photoId: p.id }} variant="danger" size="sm" confirm="Supprimer cette photo ?" className="[&>button]:min-h-8 [&>button]:px-2">
                <Trash2 className="h-4 w-4" />
              </InlineAction>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
