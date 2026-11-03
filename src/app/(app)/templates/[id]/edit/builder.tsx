"use client";
// Template builder: the form on the left, the live preview on the right.
// The checker runs as you type; saving is refused while it reports errors.
// The preview recompiles 1.5 s after the last change (latest wins).
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { PciBadge } from "@/components/badge";
import { buttonStyles } from "@/components/form";
import { PdfView, type PreviewState, fetchPdf } from "@/components/pdf-view";
import { eyebrowStyles, linkStyles } from "@/components/styles";
import { checkTemplateFields } from "@/lib/templates/check";
import { templateFieldsSchema } from "@/lib/templates/fields";
import { saveTemplateAction } from "@/server/template-actions";
import {
  AboutSection,
  type Edit,
  type Fields,
  HeaderSection,
  PageSection,
  QuestionsSection,
} from "./sections";

const PREVIEW_DELAY_MS = 1500;
const UNDO_PAUSE_MS = 800;
const UNDO_STEPS = 50;

type Problem = { message: string; path?: string };

function previewBody(f: Fields): string {
  const { program, examKind, courseKind, durationMinutes, maxMarks, structure, style, header } = f;
  return JSON.stringify({
    program,
    examKind,
    courseKind,
    durationMinutes,
    maxMarks,
    structure,
    style,
    header,
  });
}

/** "structure.parts.0.groups.1.heading" → "parts.0.groups.1"; checker paths are already short. */
function shortPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const m = /^(?:structure\.)?(parts\.\d+\.groups\.\d+)/.exec(path);
  return m ? m[1] : path;
}

interface EditorState {
  fields: Fields;
  /** Earlier versions, newest last; one step per pause in editing. */
  history: Fields[];
  lastEditAt: number;
}

type EditorAction =
  { type: "edit"; change: (draft: Fields) => void; at: number } | { type: "undo" };

function editor(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "undo") {
    const prev = state.history.at(-1);
    return prev ? { fields: prev, history: state.history.slice(0, -1), lastEditAt: 0 } : state;
  }
  const next = structuredClone(state.fields);
  action.change(next);
  const newStep = action.at - state.lastEditAt > UNDO_PAUSE_MS;
  return {
    fields: next,
    history: newStep ? [...state.history.slice(-(UNDO_STEPS - 1)), state.fields] : state.history,
    lastEditAt: action.at,
  };
}

export function Builder({
  id,
  initial,
  initialVersion,
}: {
  id: string;
  initial: Fields;
  initialVersion: number;
}) {
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; issues: Problem[] } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [{ fields, history }, dispatch] = useReducer(editor, {
    fields: initial,
    history: [],
    lastEditAt: 0,
  });
  const dirty = JSON.stringify(fields) !== saved;
  const edit: Edit = useCallback((change) => {
    dispatch({ type: "edit", change, at: Date.now() });
    setJustSaved(false);
  }, []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);

  const parsed = useMemo(() => templateFieldsSchema.safeParse(fields), [fields]);
  const check = useMemo(() => (parsed.success ? checkTemplateFields(parsed.data) : null), [parsed]);
  const problems: Problem[] = useMemo(() => {
    if (!parsed.success) {
      return parsed.error.issues.map((i) => ({ message: i.message, path: i.path.join(".") }));
    }
    return check?.errors ?? [];
  }, [parsed, check]);
  const issuesAt = useCallback(
    (path: string) =>
      [...problems, ...(saveError?.issues ?? [])]
        .filter((p) => shortPath(p.path) === path)
        .map((p) => p.message)
        .filter((m, i, all) => all.indexOf(m) === i),
    [problems, saveError],
  );

  // ---------- live preview ----------
  const [preview, setPreview] = useState<PreviewState>({ pdf: null, busy: true, error: null });
  const body = parsed.success ? previewBody(parsed.data) : null;
  const [refreshes, setRefreshes] = useState(0);
  const firstRun = useRef(true);
  useEffect(() => {
    if (body === null) return;
    const ctl = new AbortController();
    const delay = firstRun.current ? 0 : PREVIEW_DELAY_MS;
    firstRun.current = false;
    const timer = setTimeout(async () => {
      setPreview((p) => ({ ...p, busy: true }));
      const r = await fetchPdf("/api/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: ctl.signal,
      });
      if (ctl.signal.aborted || (!r.ok && r.superseded)) return;
      setPreview((p) =>
        r.ok
          ? { pdf: r.pdf, busy: false, error: null }
          : { ...p, busy: false, error: { message: r.message, details: r.details } },
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [body, refreshes]);

  // ---------- saving ----------
  const save = useCallback(async () => {
    if (saving || !parsed.success || problems.length > 0) return;
    setSaving(true);
    setSaveError(null);
    const snapshot = JSON.stringify(fields);
    let r: Awaited<ReturnType<typeof saveTemplateAction>>;
    try {
      r = await saveTemplateAction(id, version, parsed.data);
    } catch {
      // The server is not reachable (stopped, or the network dropped). Nothing is lost.
      r = {
        ok: false,
        message:
          "DRAFTEX is not reachable, so nothing was saved. Your changes are still here; try again.",
      };
    }
    setSaving(false);
    if (r.ok) {
      setVersion(r.value);
      setSaved(snapshot);
      setJustSaved(true);
    } else {
      setSaveError({ message: r.message, issues: r.issues ?? [] });
    }
  }, [saving, parsed, problems, fields, id, version]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // Unsaved changes: warn before closing the tab and before following a link.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      if (!window.confirm("Leave without saving? Your changes to this template will be lost.")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const status = saving
    ? "Saving…"
    : dirty
      ? problems.length
        ? "Not saved: fix the problems first"
        : "Unsaved changes"
      : justSaved
        ? "Saved"
        : "No changes";

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-3.5rem-1px)] lg:flex-none">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-surface px-6 py-3">
        <Link href={`/templates/${id}`} className={`${linkStyles} text-small`}>
          ← Back to the template
        </Link>
        <span className="min-w-0 flex-1 truncate text-small font-medium" title={fields.title}>
          {fields.title || "Untitled template"}
        </span>
        <span className="text-small text-ink-2" role="status">
          {status}
        </span>
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={history.length === 0}
          onClick={undo}
        >
          Undo
        </button>
        <button
          type="button"
          className={buttonStyles.primary}
          disabled={saving || !dirty || problems.length > 0}
          onClick={() => void save()}
          aria-keyshortcuts="Control+S Meta+S"
        >
          Save
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 py-5 lg:w-[30rem] lg:shrink-0 bg-surface lg:border-r lg:border-rule">
          <CheckPanel problems={problems} check={check} saveError={saveError} />
          <AboutSection f={fields} edit={edit} issuesAt={issuesAt} />
          <HeaderSection f={fields} edit={edit} />
          <QuestionsSection f={fields} edit={edit} issuesAt={issuesAt} />
          <PageSection f={fields} edit={edit} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas px-6 py-5">
          <div className="mx-auto flex max-w-[52rem] flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className={eyebrowStyles}>Preview</h2>
              <button
                type="button"
                className={buttonStyles.quiet}
                onClick={() => setRefreshes((n) => n + 1)}
                disabled={body === null}
              >
                Refresh preview
              </button>
            </div>
            {body === null ? (
              <p className="text-small text-ink-2">
                The preview waits until the problems on the left are fixed.
              </p>
            ) : null}
            <PdfView state={preview} label={`Preview of ${fields.title}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckPanel({
  problems,
  check,
  saveError,
}: {
  problems: Problem[];
  check: ReturnType<typeof checkTemplateFields> | null;
  saveError: { message: string; issues: Problem[] } | null;
}) {
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {saveError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-small text-danger"
        >
          {saveError.message}
        </div>
      ) : null}
      {problems.length ? (
        <div className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-small text-danger">
          <p className="font-medium">
            {problems.length === 1
              ? "1 problem stops saving:"
              : `${problems.length} problems stop saving:`}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {check ? (
        <div className="flex flex-col gap-1.5 text-small">
          <div className="flex items-center gap-2">
            <PciBadge status={check.pci} />
            <span className="text-ink-2">
              {check.pci === "COMPLIANT"
                ? "Follows the PCI 2026 pattern."
                : check.pci === "NON_PCI"
                  ? problems.length
                    ? "Also differs from PCI 2026:"
                    : "Can be saved, but differs from PCI 2026:"
                  : check.notice}
            </span>
          </div>
          {check.pci === "NON_PCI" ? (
            check.warnings.length > 3 ? (
              <details>
                <summary className="cursor-pointer text-ink-2">
                  Show the {check.warnings.length} differences
                </summary>
                <Differences warnings={check.warnings} />
              </details>
            ) : (
              <Differences warnings={check.warnings} />
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Differences({ warnings }: { warnings: { message: string; page?: number | string }[] }) {
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {warnings.map((w, i) => (
        <li key={i} className="rounded-md bg-caution-soft px-2.5 py-1.5">
          {w.message}
          {w.page !== undefined ? (
            <span className="block text-caption text-ink-2">
              PCI 2026 syllabus, printed page {w.page}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
