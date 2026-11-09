"use client";

import { useRef, useState } from "react";
import { Button, MentorPhoto, Spinner } from "@/components/ui";

const MAX_SIDE = 1200;
const MIN_SIDE = 300;
const MAX_LENGTH = 1_900_000;

/** Turns any photo into a sensibly sized JPEG in the browser, so a phone picture uploads quickly. */
async function prepare(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (JPG, PNG or WebP).");
  if (file.size > 15_000_000) throw new Error("That image is too large. Please choose one under 15 MB.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error("We couldn't read that image. Please choose a JPG or PNG."); }
  if (Math.min(bitmap.width, bitmap.height) < MIN_SIDE) throw new Error(`That photo is too small to look sharp. Please use one at least ${MIN_SIDE} pixels wide.`);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency; without this a transparent PNG turns black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.88, 0.75, 0.6]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length < MAX_LENGTH) return url;
  }
  throw new Error("That image is too large. Please choose a smaller one.");
}

/** Choose, replace or remove a mentor's headshot. Reports a JPEG data URL, or null when removed; the form saves it. */
export function PhotoUpload({ name, src, onChange, hint }: { name: string; src: string | null; onChange: (image: string | null) => void; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null);
    try { onChange(await prepare(file)); } catch (e) { setError(e instanceof Error ? e.message : "We couldn't use that image."); } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <MentorPhoto name={name} photoUrl={src} className="flex aspect-[4/5] w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-line sm:w-24" initialsClass="text-2xl" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Spinner /> : src ? "Replace photo" : "Upload photo"}</Button>
          {src && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setError(null); onChange(null); }}>Remove</Button>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Choose a profile photo" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : <p className="mt-2 text-xs leading-relaxed text-ink-soft">{hint ?? "JPG, PNG or WebP. A clear, recent headshot works best."}</p>}
      </div>
    </div>
  );
}
