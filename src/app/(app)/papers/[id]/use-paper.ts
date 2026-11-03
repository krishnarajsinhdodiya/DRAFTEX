"use client";
// The paper editor's state. Questions save one second after typing stops
// (SPEC §8); until the server confirms, the draft also lives in IndexedDB.
// The preview compiles the saved paper 1.5 s after the last edit (D23), the
// newest request wins, and the last good PDF stays on screen.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BloomLevel } from "@/generated/prisma/enums";
import { draftsFor, dropDraft, putDraft } from "@/lib/editor/drafts";
import { isEmptyDoc } from "@/lib/editor/convert";
import type { KeyCriterion } from "@/lib/paper/key";
import type { Problem } from "@/lib/paper/problems";
import type { Doc } from "@/lib/paper/schema";
import {
  clearSlotAction,
  duplicateSlotAction,
  moveSlotAction,
  saveSlotAction,
} from "@/server/paper-actions";
import type { EditorGroup, PaperEditorView } from "@/server/paper-view";

export const SAVE_DELAY_MS = 1000;
export const PREVIEW_DELAY_MS = 1500;
export const UNDO_LIMIT = 50;

export interface SlotValue {
  doc: Doc;
  marks: number;
  coTag: string | null;
  bloomLevel: BloomLevel | null;
  /** The answer key (D24) saves with the question, so moves and undo carry it. */
  answerKey: Doc | null;
  keyCriteria: KeyCriterion[];
}

export type SaveStatus = "saved" | "pending" | "saving" | "error";

export interface SlotState extends SlotValue {
  status: SaveStatus;
  error?: string;
  /** Bumped on every local change; a save only counts for the revision it sent. */
  rev: number;
}

export interface PreviewState {
  pdf: Uint8Array | null;
  busy: boolean;
  error: { message: string; details?: string[] } | null;
  problems: Problem[];
  compiledAt: number | null;
}

export const slotKey = (groupKey: string, position: number) => `${groupKey}.${position}`;

const EMPTY_DOC: Doc = { type: "doc", content: [] };

export type PreviewKind = "PAPER" | "KEY";

const EMPTY_PREVIEW: PreviewState = {
  pdf: null,
  busy: false,
  error: null,
  problems: [],
  compiledAt: null,
};

function initialSlots(view: PaperEditorView): Map<string, SlotState> {
  const m = new Map<string, SlotState>();
  for (const g of view.groups) {
    for (let p = 1; p <= g.slots; p++) {
      m.set(slotKey(g.key, p), {
        doc: EMPTY_DOC,
        marks: g.marksEach,
        coTag: null,
        bloomLevel: null,
        answerKey: null,
        keyCriteria: [],
        status: "saved",
        rev: 0,
      });
    }
  }
  for (const s of view.slots) {
    const k = slotKey(s.groupKey, s.position);
    const prev = m.get(k);
    if (prev)
      m.set(k, {
        ...prev,
        doc: s.content,
        marks: s.marks,
        coTag: s.coTag,
        bloomLevel: s.bloomLevel,
        answerKey: s.answerKey,
        keyCriteria: s.keyCriteria,
      });
  }
  return m;
}

interface UndoEntry {
  label: string;
  run: () => Promise<void>;
}

const valueOf = (s: SlotValue): SlotValue => ({
  doc: s.doc,
  marks: s.marks,
  coTag: s.coTag,
  bloomLevel: s.bloomLevel,
  answerKey: s.answerKey ?? null,
  keyCriteria: s.keyCriteria ?? [],
});

const same = (a: SlotValue, b: SlotValue) =>
  JSON.stringify(valueOf(a)) === JSON.stringify(valueOf(b));

/** Criteria rows still being typed (no text yet) are not sent. */
const finished = (c: KeyCriterion[]) => c.filter((x) => x.text.trim() !== "");

function decodeProblems(header: string | null): Problem[] {
  if (!header) return [];
  try {
    return JSON.parse(decodeURIComponent(header)) as Problem[];
  } catch {
    return [];
  }
}

export function usePaper(view: PaperEditorView) {
  const groups = useMemo(() => new Map(view.groups.map((g) => [g.key, g])), [view.groups]);
  const [first] = useState(() => initialSlots(view));
  const [slots, setSlots] = useState(first);
  // The source of truth, updated at once; React state follows it for rendering.
  // (A setState updater may run later, so it cannot be what timers read.)
  const slotsRef = useRef(first);
  const commit = useCallback((next: Map<string, SlotState>) => {
    slotsRef.current = next;
    setSlots(next);
  }, []);
  /** Late-bound so a save can schedule itself and an undo can call move. */
  const later = useRef<{
    saveNow: (key: string) => Promise<void>;
    move: (from: string, to: string, recordUndo?: boolean) => Promise<void>;
  }>({ saveNow: async () => {}, move: async () => {} });
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(new Set<string>());
  const [restored, setRestored] = useState(0);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [opError, setOpError] = useState<string | null>(null);
  const lastEdit = useRef(0);
  const [previews, setPreviews] = useState<Record<PreviewKind, PreviewState>>({
    PAPER: EMPTY_PREVIEW,
    KEY: EMPTY_PREVIEW,
  });
  const [kind, setKind] = useState<PreviewKind>("PAPER");
  const kindRef = useRef<PreviewKind>("PAPER");
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewAbort = useRef<Partial<Record<PreviewKind, AbortController>>>({});
  const previewSeq = useRef<Record<PreviewKind, number>>({ PAPER: 0, KEY: 0 });
  /** When each kind last started compiling; older than the last edit means stale. */
  const startedAt = useRef<Record<PreviewKind, number>>({ PAPER: 0, KEY: 0 });

  const patchSlot = useCallback(
    (key: string, patch: Partial<SlotState>) => {
      const prev = slotsRef.current.get(key);
      if (!prev) return;
      const next = new Map(slotsRef.current);
      next.set(key, { ...prev, ...patch });
      commit(next);
    },
    [commit],
  );

  // ---------- preview ----------

  const compileNow = useCallback(
    async (which: PreviewKind = kindRef.current) => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewAbort.current[which]?.abort();
      const ctrl = new AbortController();
      previewAbort.current[which] = ctrl;
      const seq = ++previewSeq.current[which];
      startedAt.current[which] = Date.now();
      const set = (f: (p: PreviewState) => PreviewState) =>
        setPreviews((all) => ({ ...all, [which]: f(all[which]) }));
      set((p) => ({ ...p, busy: true }));
      const current = () => seq === previewSeq.current[which];
      let res: Response;
      try {
        res = await fetch(
          `/api/papers/${view.id}/preview?n=${seq}${which === "KEY" ? "&kind=key" : ""}`,
          { signal: ctrl.signal, cache: "no-store" },
        );
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        set((p) => ({
          ...p,
          busy: false,
          error: { message: "DRAFTEX is not reachable. Your questions are kept on this computer." },
        }));
        return;
      }
      if (!current()) return;
      if (res.ok) {
        const pdf = new Uint8Array(await res.arrayBuffer());
        if (!current()) return;
        set(() => ({
          pdf,
          busy: false,
          error: null,
          problems: decodeProblems(res.headers.get("X-DX-Problems")),
          compiledAt: Date.now(),
        }));
        return;
      }
      if (res.status === 409) return; // a newer preview replaced this one
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        problems?: Problem[];
      };
      if (!current()) return;
      set((p) => ({
        ...p,
        busy: false,
        error: { message: body.message ?? "The preview could not be made." },
        problems: body.problems ?? [],
      }));
    },
    [view.id],
  );

  /** Shows the paper or its answer key; a stale one compiles at once. */
  const showKind = useCallback(
    (which: PreviewKind) => {
      kindRef.current = which;
      setKind(which);
      if (startedAt.current[which] < lastEdit.current || startedAt.current[which] === 0) {
        void compileNow(which);
      }
    },
    [compileNow],
  );

  /** After the last edit and once every save is in, compile. */
  const schedulePreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    const wait = Math.max(0, lastEdit.current + PREVIEW_DELAY_MS - Date.now());
    previewTimer.current = setTimeout(() => {
      const busy =
        inFlight.current.size > 0 ||
        [...slotsRef.current.values()].some((s) => s.status === "pending" || s.status === "saving");
      if (busy) return; // the save that finishes last schedules it again
      void compileNow();
    }, wait);
  }, [compileNow]);

  // ---------- saving ----------

  const saveNow = useCallback(
    async (key: string) => {
      const s = slotsRef.current.get(key);
      const [groupKey, pos] = [
        key.slice(0, key.lastIndexOf(".")),
        Number(key.slice(key.lastIndexOf(".") + 1)),
      ];
      if (!s || inFlight.current.has(key)) return;
      inFlight.current.add(key);
      const rev = s.rev;
      patchSlot(key, { status: "saving" });
      let r: { ok: boolean; message?: string };
      try {
        r = isEmptyDoc(s.doc)
          ? await clearSlotAction(view.id, { groupKey, position: pos })
          : await saveSlotAction(view.id, {
              groupKey,
              position: pos,
              content: s.doc,
              marks: s.marks,
              coTag: s.coTag,
              bloomLevel: s.bloomLevel,
              answerKey: s.answerKey && !isEmptyDoc(s.answerKey) ? s.answerKey : null,
              keyCriteria: finished(s.keyCriteria),
            });
      } catch {
        r = {
          ok: false,
          message: "Not saved yet: DRAFTEX is not reachable. Kept on this computer.",
        };
      }
      inFlight.current.delete(key);
      const now = slotsRef.current.get(key);
      if (!now) return;
      if (!r.ok) {
        patchSlot(key, { status: "error", error: r.message ?? "Not saved." });
        return;
      }
      if (now.rev === rev) {
        patchSlot(key, { status: "saved", error: undefined });
        void dropDraft(view.id, key);
        schedulePreview();
      } else {
        // Typed again while saving: save the newer text too.
        patchSlot(key, { status: "pending" });
        timers.current.set(
          key,
          setTimeout(() => void later.current.saveNow(key), SAVE_DELAY_MS),
        );
      }
    },
    [patchSlot, schedulePreview, view.id],
  );

  const change = useCallback(
    (key: string, patch: Partial<SlotValue>) => {
      const prev = slotsRef.current.get(key);
      if (!prev) return;
      const next = { ...prev, ...patch };
      if (same(prev, next)) return;
      lastEdit.current = Date.now();
      patchSlot(key, { ...patch, status: "pending", rev: prev.rev + 1, error: undefined });
      void putDraft(view.id, key, valueOf(next));
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      timers.current.set(
        key,
        setTimeout(() => void saveNow(key), SAVE_DELAY_MS),
      );
      schedulePreview();
    },
    [patchSlot, saveNow, schedulePreview, view.id],
  );

  const retry = useCallback((key: string) => void saveNow(key), [saveNow]);

  // Restore drafts this computer kept but the server never confirmed.
  useEffect(() => {
    let cancelled = false;
    void draftsFor(view.id).then((drafts) => {
      if (cancelled) return;
      let n = 0;
      for (const d of drafts) {
        const prev = slotsRef.current.get(d.slotId);
        const stored = d.value as Partial<SlotValue> | undefined;
        if (!prev || !stored?.doc) continue;
        // Drafts kept before answer keys existed have no key fields.
        const value = valueOf({ ...prev, ...stored } as SlotValue);
        if (same(prev, value)) {
          void dropDraft(view.id, d.slotId);
          continue;
        }
        n++;
        change(d.slotId, value);
      }
      setRestored(n);
    });
    return () => {
      cancelled = true;
    };
  }, [change, view.id]);

  // First preview at once; warn before leaving with unsaved questions.
  useEffect(() => {
    const first = setTimeout(() => void compileNow("PAPER"), 0);
    const unsaved = (e: BeforeUnloadEvent) => {
      if ([...slotsRef.current.values()].some((s) => s.status !== "saved")) e.preventDefault();
    };
    window.addEventListener("beforeunload", unsaved);
    const pending = timers.current;
    // One object for the hook's lifetime; its entries change, the object does not.
    const aborts = previewAbort.current;
    return () => {
      window.removeEventListener("beforeunload", unsaved);
      clearTimeout(first);
      pending.forEach(clearTimeout);
      Object.values(aborts).forEach((c) => c?.abort());
    };
  }, [compileNow]);

  // ---------- paper-level operations (D25) ----------

  const pushUndo = useCallback(
    (entry: UndoEntry) => setUndoStack((s) => [...s.slice(-(UNDO_LIMIT - 1)), entry]),
    [],
  );

  /** Waits for a question's own save so an operation never races its text. */
  const flush = useCallback(
    async (key: string) => {
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      timers.current.delete(key);
      const s = slotsRef.current.get(key);
      if (s && s.status !== "saved") await saveNow(key);
    },
    [saveNow],
  );

  const restore = useCallback(
    async (key: string, value: SlotValue) => {
      patchSlot(key, {
        ...value,
        status: "pending",
        rev: (slotsRef.current.get(key)?.rev ?? 0) + 1,
      });
      await saveNow(key);
    },
    [patchSlot, saveNow],
  );

  const clear = useCallback(
    async (key: string) => {
      await flush(key);
      const before = slotsRef.current.get(key);
      const g = groups.get(place(key).groupKey);
      if (!before || !g) return;
      const r = await clearSlotAction(view.id, place(key));
      if (!r.ok) return setOpError(r.message);
      setOpError(null);
      patchSlot(key, {
        doc: EMPTY_DOC,
        marks: g.marksEach,
        coTag: null,
        bloomLevel: null,
        answerKey: null,
        keyCriteria: [],
        status: "saved",
      });
      void dropDraft(view.id, key);
      pushUndo({ label: `Clear ${label(g, key)}`, run: () => restore(key, before) });
      lastEdit.current = Date.now();
      schedulePreview();
    },
    [flush, groups, patchSlot, pushUndo, restore, schedulePreview, view.id],
  );

  const swapLocal = useCallback(
    (a: string, b: string) => {
      const ga = groups.get(place(a).groupKey) as EditorGroup;
      const gb = groups.get(place(b).groupKey) as EditorGroup;
      {
        const old = slotsRef.current;
        const sa = old.get(a) as SlotState;
        const sb = old.get(b) as SlotState;
        const next = new Map(old);
        const moved = (s: SlotState, from: EditorGroup, to: EditorGroup): SlotState => ({
          ...s,
          // Marks follow the place: another group's question takes that group's marks.
          marks: from.key === to.key ? s.marks : to.marksEach,
          status: "saved",
        });
        next.set(b, moved(sa, ga, gb));
        next.set(a, moved(sb, gb, ga));
        commit(next);
      }
    },
    [commit, groups],
  );

  const move = useCallback(
    async (from: string, to: string, recordUndo = true) => {
      await Promise.all([flush(from), flush(to)]);
      const r = await moveSlotAction(view.id, place(from), place(to));
      if (!r.ok) return setOpError(r.message);
      setOpError(null);
      swapLocal(from, to);
      void dropDraft(view.id, from);
      void dropDraft(view.id, to);
      if (recordUndo) {
        const g = groups.get(place(from).groupKey) as EditorGroup;
        pushUndo({
          label: `Move ${label(g, from)}`,
          run: () => later.current.move(to, from, false),
        });
      }
      lastEdit.current = Date.now();
      schedulePreview();
    },
    [flush, groups, pushUndo, schedulePreview, swapLocal, view.id],
  );

  const duplicate = useCallback(
    async (key: string) => {
      await flush(key);
      const r = await duplicateSlotAction(view.id, place(key));
      if (!r.ok) return setOpError(r.message);
      setOpError(null);
      const src = slotsRef.current.get(key) as SlotState;
      const to = slotKey(r.value.groupKey, r.value.position);
      patchSlot(to, { ...valueOf(src), status: "saved" });
      const g = groups.get(place(key).groupKey) as EditorGroup;
      pushUndo({
        label: `Duplicate ${label(g, key)}`,
        run: async () => {
          await clearSlotAction(view.id, place(to));
          const tg = groups.get(r.value.groupKey) as EditorGroup;
          patchSlot(to, {
            doc: EMPTY_DOC,
            marks: tg.marksEach,
            coTag: null,
            bloomLevel: null,
            answerKey: null,
            keyCriteria: [],
            status: "saved",
          });
        },
      });
      lastEdit.current = Date.now();
      schedulePreview();
      return to;
    },
    [flush, groups, patchSlot, pushUndo, schedulePreview, view.id],
  );

  /** A marks change can be undone from the paper toolbar too. */
  const setMarks = useCallback(
    (key: string, marks: number) => {
      const before = slotsRef.current.get(key);
      if (!before || before.marks === marks) return;
      const g = groups.get(place(key).groupKey) as EditorGroup;
      pushUndo({
        label: `Marks of ${label(g, key)}`,
        run: async () => change(key, { marks: before.marks }),
      });
      change(key, { marks });
    },
    [change, groups, pushUndo],
  );

  const undo = useCallback(async () => {
    const entry = undoStack.at(-1);
    if (!entry) return;
    setUndoStack((s) => s.slice(0, -1));
    await entry.run();
  }, [undoStack]);

  useLayoutEffect(() => {
    later.current = { saveNow, move };
  }, [saveNow, move]);

  const saving = [...slots.values()].some((s) => s.status === "pending" || s.status === "saving");
  const failed = [...slots.entries()].filter(([, s]) => s.status === "error");

  return {
    groups,
    slots,
    change,
    setMarks,
    retry,
    clear,
    move,
    duplicate,
    undo,
    undoLabel: undoStack.at(-1)?.label ?? null,
    opError,
    dismissOpError: () => setOpError(null),
    restored,
    saving,
    failed,
    preview: previews[kind],
    /** Problems of each kind, so a key problem shows on its question even while the paper shows. */
    paperProblems: previews.PAPER.problems,
    keyProblems: previews.KEY.problems,
    previewKind: kind,
    showKind,
    recompile: () => void compileNow(),
  };
}

function place(key: string) {
  return {
    groupKey: key.slice(0, key.lastIndexOf(".")),
    position: Number(key.slice(key.lastIndexOf(".") + 1)),
  };
}

export function label(g: EditorGroup, key: string): string {
  return g.slotLabels[Number(key.slice(key.lastIndexOf(".") + 1)) - 1] ?? key;
}
