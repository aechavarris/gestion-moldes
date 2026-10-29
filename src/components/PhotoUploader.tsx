"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadPhoto } from "@/lib/actions";

const MAX_SIDE = 1600;
const THUMB_SIDE = 400;

/** Re-encodes on a canvas: phone photos are 3-8 MB, this keeps them around 300 KB and strips EXIF (GPS) data. */
async function resize(file: File, maxSide: number, quality: number) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("No se pudo procesar la imagen");
  return { blob, width, height };
}

export function PhotoUploader({ sheetId, disabled }: { sheetId: string; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, startTransition] = useTransition();
  const [progress, setProgress] = useState("");

  function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(undefined);
    startTransition(async () => {
      const list = [...files];
      for (const [i, file] of list.entries()) {
        setProgress(list.length > 1 ? ` ${i + 1}/${list.length}` : "");
        try {
          const photo = await resize(file, MAX_SIDE, 0.82);
          const thumb = await resize(file, THUMB_SIDE, 0.75);
          const form = new FormData();
          form.set("photo", photo.blob, "photo.jpg");
          form.set("thumbnail", thumb.blob, "thumb.jpg");
          form.set("width", String(photo.width));
          form.set("height", String(photo.height));
          const result = await uploadPhoto(sheetId, form);
          if (result.error) {
            setError(result.error);
            break;
          }
        } catch {
          setError("No se pudo subir la foto");
          break;
        }
      }
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      <button type="button" className="btn-ghost" disabled={busy || disabled} onClick={() => input.current?.click()}>
        {busy ? `Subiendo${progress}…` : "📷 Añadir fotos"}
      </button>
      {error ? <p className="text-danger">{error}</p> : null}
    </div>
  );
}
