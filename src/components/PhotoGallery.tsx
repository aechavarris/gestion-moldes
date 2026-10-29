"use client";

import { useState, useTransition } from "react";
import { deletePhoto } from "@/lib/actions";

type PhotoItem = { id: string; width: number; height: number };

/** Thumbnail grid; tapping one opens it full screen, where it can be deleted. */
export function PhotoGallery({ photos }: { photos: PhotoItem[] }) {
  const [open, setOpen] = useState<PhotoItem | null>(null);
  const [deleting, startTransition] = useTransition();

  if (!photos.length) return <p className="text-sm text-muted">Sin fotos.</p>;

  return (
    <>
      <ul className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <li key={photo.id}>
            <button type="button" className="block w-full" onClick={() => setOpen(photo)} aria-label="Ver foto">
              {/* eslint-disable-next-line @next/next/no-img-element -- served by our own authenticated route */}
              <img src={`/photos/${photo.id}?thumb`} alt="" className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <div className="fixed inset-0 z-20 flex flex-col bg-black/95" role="dialog" aria-modal="true">
          <div className="flex justify-between gap-2 p-3">
            <button
              type="button"
              className="btn border border-red-400 text-red-300"
              disabled={deleting}
              onClick={() => {
                if (!window.confirm("¿Eliminar esta foto?")) return;
                startTransition(async () => {
                  await deletePhoto(open.id);
                  setOpen(null);
                });
              }}
            >
              Eliminar
            </button>
            <button type="button" className="btn border border-white/30 text-white" onClick={() => setOpen(null)}>
              Cerrar
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- served by our own authenticated route */}
          <img src={`/photos/${open.id}`} alt="" width={open.width} height={open.height} className="min-h-0 flex-1 object-contain" />
        </div>
      ) : null}
    </>
  );
}
