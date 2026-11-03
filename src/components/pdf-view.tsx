"use client";
// Renders PDF bytes to canvases with pdf.js (SPEC §5). The last good PDF
// stays on screen while a new one is made; status and errors sit above it.
import type * as PdfJsModule from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

type PdfJs = typeof PdfJsModule;
let pdfjsPromise: Promise<PdfJs> | undefined;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return m;
  });
  return pdfjsPromise;
}

export interface PreviewState {
  /** Bytes of the last PDF that compiled. */
  pdf: Uint8Array | null;
  busy: boolean;
  error: { message: string; details?: string[] } | null;
}

export function PdfView({ state, label }: { state: PreviewState; label: string }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      // Re-render only when the width changes by a visible amount.
      const w = Math.round((entry?.contentRect.width ?? 0) / 8) * 8;
      setWidth((old) => (old === w ? old : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const host = pagesRef.current;
    const bytes = state.pdf;
    if (!host || !bytes || width === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        // pdf.js takes ownership of the buffer it is given, so hand it a copy.
        const task = pdfjs.getDocument({ data: bytes.slice() });
        const doc = await task.promise;
        const canvases: HTMLCanvasElement[] = [];
        const ratio = window.devicePixelRatio || 1;
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.className = "block bg-white shadow-sm ring-1 ring-black/10";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${label}, page ${n} of ${doc.numPages}`);
          await page.render({ canvas, viewport }).promise;
          canvases.push(canvas);
          if (cancelled) break;
        }
        await task.destroy();
        if (cancelled) return;
        host.replaceChildren(...canvases);
        setRenderError(null);
      } catch {
        if (!cancelled) setRenderError("The preview could not be shown.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.pdf, width, label]);

  const error = state.error ?? (renderError ? { message: renderError } : null);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex min-h-6 items-center gap-2 text-sm" aria-live="polite">
        {state.busy ? (
          <span className="text-neutral-600 dark:text-neutral-400">Making the preview…</span>
        ) : null}
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <p>{error.message}</p>
          {error.details?.length ? (
            <details className="mt-1">
              <summary className="cursor-pointer">Details</summary>
              <ul className="mt-1 list-disc pl-5">
                {error.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {state.pdf ? <p className="mt-1">The last preview that worked is shown below.</p> : null}
        </div>
      ) : null}
      <div
        ref={pagesRef}
        className={`flex flex-col gap-4 transition-opacity duration-150 ${state.busy && state.pdf ? "opacity-70" : ""}`}
      />
      {!state.pdf && state.busy ? (
        // An empty A4 sheet holds the place, so the layout does not jump when pages arrive.
        <div
          aria-hidden
          className="aspect-[210/297] w-full bg-white shadow-sm ring-1 ring-black/10 dark:bg-neutral-800"
        />
      ) : null}
      {!state.pdf && !state.busy && !error ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">No preview yet.</p>
      ) : null}
    </div>
  );
}

/** Fetches a PDF, latest request wins. Returns the state for PdfView. */
export async function fetchPdf(
  input: RequestInfo,
  init: RequestInit,
): Promise<
  | { ok: true; pdf: Uint8Array }
  | { ok: false; superseded?: boolean; message: string; details?: string[] }
> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      return { ok: false, superseded: true, message: "" };
    return { ok: false, message: "DRAFTEX is not reachable. Is it still running?" };
  }
  if (res.ok) return { ok: true, pdf: new Uint8Array(await res.arrayBuffer()) };
  if (res.status === 409) return { ok: false, superseded: true, message: "" };
  const body = (await res.json().catch(() => ({}))) as { message?: string; details?: string[] };
  return {
    ok: false,
    message: body.message ?? "The preview could not be made.",
    details: body.details,
  };
}
