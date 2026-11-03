"use client";
// The paper editor (SPEC §8): outline on the left, the paper's questions in
// print order in the centre, the PDF on the right (resizable, collapsible).
import { Download, PanelRightClose, PanelRightOpen, RefreshCw, Undo2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Uploader } from "@/components/editor/question-editor";
import { FormAlert } from "@/components/form";
import { PciBadge } from "@/components/badge";
import { PdfView } from "@/components/pdf-view";
import { buttonStyles, eyebrowStyles, linkStyles } from "@/components/styles";
import { isEmptyDoc } from "@/lib/editor/convert";
import { marksLabel } from "@/lib/latex/serialize";
import { marksText } from "@/lib/templates/labels";
import type { EditorGroup, PaperEditorView } from "@/server/paper-view";
import { DetailsButton } from "./details";
import { SlotCard } from "./slot-card";
import { slotKey, usePaper } from "./use-paper";

const upload: Uploader = async (file) => {
  const body = new FormData();
  body.set("file", file);
  let res: Response;
  try {
    res = await fetch("/api/assets", { method: "POST", body });
  } catch {
    throw new Error("DRAFTEX is not reachable, so the picture was not added.");
  }
  const json = (await res.json().catch(() => ({}))) as {
    message?: string;
    sha256?: string;
    ext?: "png" | "jpg" | "pdf";
    width?: number;
  };
  if (!res.ok || !json.sha256 || !json.ext) {
    throw new Error(json.message ?? "The picture could not be added.");
  }
  return { sha256: json.sha256, ext: json.ext, width: json.width ?? 600 };
};

const PREVIEW_MIN = 320;
const PREVIEW_MAX = 900;
const WIDTH_KEY = "draftex.previewWidth";

const widthListeners = new Set<() => void>();
function readWidth(): number {
  const v = Number(localStorage.getItem(WIDTH_KEY));
  return v >= PREVIEW_MIN && v <= PREVIEW_MAX ? v : 480;
}
function useStoredWidth() {
  const width = useSyncExternalStore(
    (l) => {
      widthListeners.add(l);
      return () => widthListeners.delete(l);
    },
    readWidth,
    () => 480,
  );
  const set = (w: number) => {
    localStorage.setItem(
      WIDTH_KEY,
      String(Math.round(Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, w)))),
    );
    widthListeners.forEach((l) => l());
  };
  return [width, set] as const;
}

export function PaperEditor({
  view,
  allowAdvanced,
}: {
  view: PaperEditorView;
  allowAdvanced: boolean;
}) {
  const paper = usePaper(view);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(true);
  const [previewWidth, setPreviewWidth] = useStoredWidth();
  const dragging = useRef<{ x: number; w: number } | null>(null);

  const activate = useCallback((key: string) => {
    setActive((s) => (s.has(key) ? s : new Set(s).add(key)));
  }, []);

  const problems = paper.preview.problems;
  const problemsBySlot = useMemo(() => {
    const m = new Map<string, typeof problems>();
    for (const p of problems) {
      if (!p.slotId) continue;
      m.set(p.slotId, [...(m.get(p.slotId) ?? []), p]);
    }
    return m;
  }, [problems]);
  const paperProblems = problems.filter((p) => !p.slotId);

  const moveBy = useCallback(
    (key: string, by: -1 | 1) => {
      const dot = key.lastIndexOf(".");
      const to = slotKey(key.slice(0, dot), Number(key.slice(dot + 1)) + by);
      void paper.move(key, to);
    },
    [paper],
  );

  // Ctrl/Cmd+Z outside a text field undoes the last paper-level change.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true], math-field")) return;
      e.preventDefault();
      void paper.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paper]);

  const totals = useMemo(() => {
    let written = 0;
    let count = 0;
    for (const g of view.groups) {
      for (let p = 1; p <= g.slots; p++) {
        const s = paper.slots.get(slotKey(g.key, p));
        if (s && !isEmptyDoc(s.doc)) written++;
        count++;
      }
    }
    return { written, count };
  }, [paper.slots, view.groups]);

  const groupMarks = (g: EditorGroup) => {
    const marks = Array.from(
      { length: g.slots },
      (_, i) => paper.slots.get(slotKey(g.key, i + 1))?.marks ?? g.marksEach,
    )
      .sort((a, b) => b - a)
      .slice(0, g.attempt);
    return marks.reduce((a, b) => a + b, 0);
  };
  const paperMarks = view.groups.reduce((a, g) => a + groupMarks(g), 0);

  const download = () => {
    const pdf = paper.preview.pdf;
    if (!pdf) return;
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(view.courseCode || "paper").replace(/[^\w.-]+/g, "_")} ${view.title.replace(/[^\w .-]+/g, "_")}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const saveState = paper.failed.length
    ? `${paper.failed.length} not saved`
    : paper.saving
      ? "Saving…"
      : "All changes saved";

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-3.5rem-1px)] lg:flex-none">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule bg-surface px-4 py-2">
        <Link href="/papers" className={`${linkStyles} text-small`}>
          ← Papers
        </Link>
        <h1
          className="min-w-0 flex-1 truncate font-paper text-lead font-semibold"
          title={view.title}
        >
          {view.title}
        </h1>
        <span
          role="status"
          className={`text-small ${paper.failed.length ? "text-danger" : "text-ink-2"}`}
        >
          {saveState}
        </span>
        <button
          type="button"
          className={buttonStyles.quiet}
          disabled={!paper.undoLabel}
          onClick={() => void paper.undo()}
          title={paper.undoLabel ? `Undo: ${paper.undoLabel}` : "Nothing to undo"}
        >
          <Undo2 size={15} aria-hidden /> Undo
        </button>
        <DetailsButton view={view} />
        <button
          type="button"
          className={buttonStyles.quiet}
          onClick={() => setShowPreview((v) => !v)}
          aria-pressed={showPreview}
        >
          {showPreview ? (
            <PanelRightClose size={15} aria-hidden />
          ) : (
            <PanelRightOpen size={15} aria-hidden />
          )}
          Preview
        </button>
      </div>

      {paper.restored ? (
        <div className="px-4 pt-3">
          <FormAlert kind="notice">
            {paper.restored === 1
              ? "1 question had changes kept on this computer that had not reached DRAFTEX. They are being saved now."
              : `${paper.restored} questions had changes kept on this computer that had not reached DRAFTEX. They are being saved now.`}
          </FormAlert>
        </div>
      ) : null}
      {paper.opError ? (
        <div className="px-4 pt-3">
          <FormAlert kind="error">{paper.opError}</FormAlert>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav
          aria-label="Questions"
          className="hidden w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-rule bg-surface px-3 py-4 xl:flex"
        >
          <div>
            <p className={eyebrowStyles}>Paper</p>
            <p className="mt-1 text-small text-ink-2">
              {totals.written} of {totals.count} questions written
            </p>
            <p className="dx-margin mt-1 text-body font-semibold">
              {marksText(paperMarks)} / {view.maxMarksText}
            </p>
            {paperMarks !== view.maxMarks ? (
              <p className="mt-1 text-caption text-caution">
                Marks changed on some questions; the paper no longer adds up to {view.maxMarksText}.
              </p>
            ) : null}
          </div>
          {view.parts.map((part) => (
            <div key={part.key} className="flex flex-col gap-2">
              {part.title ? (
                <p className="font-paper text-small font-semibold">{part.title}</p>
              ) : null}
              {view.groups
                .filter((g) => g.partKey === part.key)
                .map((g) => {
                  const filled = Array.from({ length: g.slots }, (_, i) =>
                    paper.slots.get(slotKey(g.key, i + 1)),
                  ).filter((s) => s && !isEmptyDoc(s.doc)).length;
                  return (
                    <div key={g.key} className="flex flex-col gap-1">
                      <a
                        href={`#g-${g.key}`}
                        className="flex items-baseline justify-between gap-2 rounded text-small hover:text-accent"
                      >
                        <span className="font-semibold">
                          {g.label ?? `${g.printed[0]}–${g.printed.at(-1)}`}
                        </span>
                        <span className="text-caption text-ink-3 tabular-nums">
                          {filled}/{g.slots}
                        </span>
                      </a>
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: g.slots }, (_, i) => {
                          const k = slotKey(g.key, i + 1);
                          const s = paper.slots.get(k);
                          const bad =
                            (problemsBySlot.get(k) ?? []).some((p) => p.level === "error") ||
                            s?.status === "error";
                          const done = s && !isEmptyDoc(s.doc);
                          return (
                            <a
                              key={k}
                              href={`#q-${k}`}
                              onClick={() => activate(k)}
                              aria-label={`${g.slotLabels[i]}${done ? ", written" : ", empty"}${bad ? ", has a problem" : ""}`}
                              className={
                                "inline-flex size-6 items-center justify-center rounded text-caption tabular-nums focus-visible:outline-2 focus-visible:outline-accent " +
                                (bad
                                  ? "bg-danger-soft font-semibold text-danger"
                                  : done
                                    ? "bg-accent-soft text-accent"
                                    : "border border-rule text-ink-3")
                              }
                            >
                              {g.numbering === "QUESTION"
                                ? (g.printed[i] ?? "").replace(/\D/g, "")
                                : i + 1}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto bg-canvas px-4 py-5 lg:px-8">
          <article className="mx-auto flex max-w-3xl flex-col gap-4 rounded-lg bg-surface px-4 py-6 shadow-sheet sm:px-8">
            <header className="flex flex-col items-center gap-0.5 border-b border-ink pb-3 text-center font-paper">
              <p className="text-small font-semibold tracking-[0.04em]">
                {view.courseTitle || "Course title"} {view.courseCode ? `[${view.courseCode}]` : ""}
              </p>
              <p className="text-caption text-ink-2">
                {view.templateTitle} · {view.duration} · {view.maxMarksText} marks
                {view.examDate ? ` · ${view.examDate.split("-").reverse().join("/")}` : ""}
              </p>
              <span className="mt-1">
                <PciBadge status={view.pci.status} />
              </span>
            </header>
            {view.pci.warnings.length ? (
              <ul className="flex flex-col gap-1 text-small">
                {view.pci.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="rounded-md border-l-2 border-caution bg-caution-soft px-3 py-1.5"
                  >
                    {w.message}
                  </li>
                ))}
              </ul>
            ) : null}

            {view.parts.map((part) => (
              <section
                key={part.key}
                aria-label={part.title ?? "Questions"}
                className="flex flex-col gap-4"
              >
                {part.title ? (
                  <h2 className="text-center font-paper text-body font-semibold tracking-[0.04em]">
                    {part.title}
                  </h2>
                ) : null}
                {view.groups
                  .filter((g) => g.partKey === part.key)
                  .map((g) => (
                    <section
                      key={g.key}
                      id={`g-${g.key}`}
                      aria-label={g.label ?? g.heading}
                      className="scroll-mt-20"
                    >
                      {g.numbering === "GROUP" ? (
                        <h3 className="mb-1 flex items-baseline gap-3 font-paper text-body font-semibold">
                          <span className="min-w-0 flex-1">
                            {g.label} {g.heading}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {marksLabel(view.marksStyle, groupMarks(g))}
                          </span>
                        </h3>
                      ) : (
                        <p className="mb-1 text-caption text-ink-3">
                          {g.heading} (not printed: each question shows its own number)
                        </p>
                      )}
                      <ol className="flex flex-col gap-1">
                        {Array.from({ length: g.slots }, (_, i) => {
                          const k = slotKey(g.key, i + 1);
                          const state = paper.slots.get(k);
                          if (!state) return null;
                          return (
                            <SlotCard
                              key={k}
                              slotKey={k}
                              group={g}
                              position={i + 1}
                              state={state}
                              problems={problemsBySlot.get(k) ?? []}
                              coOptions={view.coOptions}
                              allowAdvanced={allowAdvanced}
                              upload={upload}
                              active={active.has(k)}
                              onActivate={activate}
                              onChange={paper.change}
                              onMarks={paper.setMarks}
                              onRetry={paper.retry}
                              onClear={(key) => void paper.clear(key)}
                              onMove={moveBy}
                              onDuplicate={(key) =>
                                void paper.duplicate(key).then((to) => to && activate(to))
                              }
                            />
                          );
                        })}
                      </ol>
                    </section>
                  ))}
              </section>
            ))}
          </article>
        </main>

        {showPreview ? (
          <aside
            aria-label="PDF preview"
            className="relative flex min-h-0 shrink-0 flex-col border-l border-rule bg-canvas lg:w-[var(--w)]"
            style={{ "--w": `${previewWidth}px` } as React.CSSProperties}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the preview"
              aria-valuemin={PREVIEW_MIN}
              aria-valuemax={PREVIEW_MAX}
              aria-valuenow={previewWidth}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setPreviewWidth(previewWidth + 32);
                if (e.key === "ArrowRight") setPreviewWidth(previewWidth - 32);
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                dragging.current = { x: e.clientX, w: previewWidth };
              }}
              onPointerMove={(e) => {
                if (dragging.current)
                  setPreviewWidth(dragging.current.w + dragging.current.x - e.clientX);
              }}
              onPointerUp={() => (dragging.current = null)}
              className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize hover:bg-accent/20 focus-visible:bg-accent/30 focus-visible:outline-none lg:block"
            />
            <div className="flex items-center gap-2 px-4 py-2">
              <h2 className={eyebrowStyles}>Preview</h2>
              <span className="ml-auto" />
              <button type="button" className={buttonStyles.quiet} onClick={paper.recompile}>
                <RefreshCw size={14} aria-hidden /> Recompile
              </button>
              <button
                type="button"
                className={buttonStyles.quiet}
                onClick={download}
                disabled={!paper.preview.pdf}
              >
                <Download size={14} aria-hidden /> Download PDF
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {paperProblems.length ? (
                <ul className="mb-3 flex flex-col gap-1 text-small">
                  {paperProblems.map((p, i) => (
                    <li key={i} className={p.level === "error" ? "text-danger" : "text-caution"}>
                      {p.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <PdfView state={paper.preview} label={view.title} />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
