"use client";
// The paper editor's question bank dialogs: the picker ("Insert from bank",
// D78), filtered by course, unit, CO, Bloom, marks and text, with "last used
// in" for the signed-in user only (D75); and the report after "Add to bank"
// (D77), listing what was added and what was skipped, with the reason.
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { StaticDoc } from "@/components/editor/static-doc";
import { FormAlert } from "@/components/form";
import { buttonStyles, dialogStyles, inputStyles } from "@/components/styles";
import type { AddReport } from "@/lib/data/bank";
import { BLOOM_LABEL, BLOOM_LEVELS } from "@/lib/paper/bloom";
import { marksText } from "@/lib/templates/labels";
import { searchBankAction } from "@/server/bank-actions";
import { LastUse, OwnerBadge, facts, firstLine } from "../../bank/bank-list";
import type { BankPick } from "./use-paper";

type Results = Awaited<ReturnType<typeof searchBankAction>>;

const wide = `${dialogStyles} w-[min(52rem,calc(100vw-2rem))]`;
const label = "flex flex-col gap-1 text-small font-medium";

export function BankPicker({
  open,
  onOpenChange,
  slotName,
  slotEmpty,
  courseCode,
  marks,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slotName: string;
  slotEmpty: boolean;
  courseCode: string;
  marks: number;
  onPick: (q: BankPick) => Promise<{ marksDiffer: boolean } | null>;
}) {
  const ids = useId();
  const [filter, setFilter] = useState({
    q: "",
    course: courseCode,
    co: "",
    bloom: "",
    unit: "",
    marks: String(marks),
  });
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = setTimeout(() => {
      start(async () => {
        try {
          const r = await searchBankAction({
            q: filter.q.trim() || undefined,
            course: filter.course.trim().toUpperCase() || undefined,
            co: filter.co.trim() || undefined,
            bloom: filter.bloom || undefined,
            unit: filter.unit || undefined,
            marks: filter.marks || undefined,
          });
          if (n === seq.current) {
            setResults(r);
            setError(null);
          }
        } catch {
          if (n === seq.current) setError("The search did not work. Check the filters.");
        }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [open, filter]);

  const set = (patch: Partial<typeof filter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content className={`${wide} flex flex-col gap-4`}>
          <div>
            <Dialog.Title className="font-paper text-title font-semibold">
              Insert {slotName} from the question bank
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-small text-ink-2">
              The question is copied: later changes in the bank or the paper do not touch the other.
              {slotEmpty
                ? ""
                : ` ${slotName} already has text; inserting replaces it (Undo brings it back).`}
            </Dialog.Description>
          </div>
          <div role="search" className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <label className={`${label} col-span-2 sm:col-span-2`}>
              Search
              <input
                type="search"
                value={filter.q}
                maxLength={100}
                placeholder="Words or a tag"
                onChange={(e) => set({ q: e.target.value })}
                className={inputStyles}
              />
            </label>
            <label className={label}>
              Course
              <input
                value={filter.course}
                maxLength={40}
                placeholder="Any"
                onChange={(e) => set({ course: e.target.value })}
                className={inputStyles}
              />
            </label>
            <label className={label}>
              CO
              <input
                value={filter.co}
                maxLength={29}
                placeholder="Any"
                onChange={(e) => set({ co: e.target.value })}
                className={inputStyles}
              />
            </label>
            <label className={label}>
              Bloom
              <select
                value={filter.bloom}
                onChange={(e) => set({ bloom: e.target.value })}
                className={inputStyles}
              >
                <option value="">Any</option>
                {BLOOM_LEVELS.map((b) => (
                  <option key={b} value={b}>
                    {BLOOM_LABEL[b]}
                  </option>
                ))}
              </select>
            </label>
            <span className="grid grid-cols-2 gap-2">
              <label className={label}>
                Unit
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={filter.unit}
                  placeholder="Any"
                  onChange={(e) => set({ unit: e.target.value })}
                  className={inputStyles}
                />
              </label>
              <label className={label}>
                Marks
                <input
                  type="number"
                  min={0.5}
                  max={100}
                  step="any"
                  value={filter.marks}
                  placeholder="Any"
                  onChange={(e) => set({ marks: e.target.value })}
                  className={inputStyles}
                />
              </label>
            </span>
          </div>
          <p className="text-small text-ink-2" aria-live="polite">
            {pending && !results
              ? "Searching…"
              : results
                ? results.total === 1
                  ? "1 question"
                  : `${results.total} questions${results.total > results.rows.length ? `, showing the newest ${results.rows.length}; narrow them with the filters` : ""}`
                : ""}
          </p>
          {error ? <FormAlert kind="error">{error}</FormAlert> : null}
          <ul
            aria-label="Questions"
            className="flex max-h-[50dvh] flex-col divide-y divide-rule overflow-y-auto rounded-md border border-rule"
          >
            {results?.rows.map((q) => (
              <PickerRow
                key={q.id}
                q={q}
                ids={ids}
                replace={!slotEmpty}
                slotMarks={marks}
                onPick={async () => {
                  const r = await onPick({
                    id: q.id,
                    content: q.content,
                    coTag: q.coTag,
                    bloomLevel: q.bloomLevel,
                    answerKey: q.answerKey,
                    keyCriteria: q.keyCriteria,
                  });
                  if (r) onOpenChange(false);
                }}
              />
            ))}
            {results && results.rows.length === 0 ? (
              <li className="px-4 py-6 text-center text-small text-ink-2">
                No questions match. Clear a filter, or add questions on the Bank page.
              </li>
            ) : null}
          </ul>
          <div className="flex justify-end">
            <Dialog.Close className={buttonStyles.secondary}>Close</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PickerRow({
  q,
  ids,
  replace,
  slotMarks,
  onPick,
}: {
  q: Results["rows"][number];
  ids: string;
  replace: boolean;
  slotMarks: number;
  onPick: () => Promise<void>;
}) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const bodyId = `${ids}-${q.id}`;
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {/* At least 14rem for the text, so the buttons wrap below it on a phone. */}
        <span className="flex min-w-0 flex-[1_1_14rem] flex-col gap-1">
          <span className="font-paper text-body break-words [overflow-wrap:anywhere]">
            {firstLine(q.searchText, 200)}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2">
            <span className="break-words [overflow-wrap:anywhere]">{facts(q)}</span>
            {q.marks !== null ? (
              <span className={q.marks === slotMarks ? "" : "text-caution"}>
                {marksText(q.marks)} {q.marks === 1 ? "mark" : "marks"}
              </span>
            ) : null}
            {q.mine ? null : <OwnerBadge name={q.ownerName} />}
          </span>
          <LastUse use={q.lastUse} />
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className={buttonStyles.quiet}
            aria-expanded={show}
            aria-controls={bodyId}
            onClick={() => setShow((x) => !x)}
          >
            {show ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            disabled={busy}
            className={`${buttonStyles.secondary} h-8 px-3 text-small`}
            onClick={async () => {
              setBusy(true);
              await onPick();
              setBusy(false);
            }}
          >
            {replace ? "Replace with this" : "Insert"}
          </button>
        </span>
      </div>
      {show ? (
        <div id={bodyId} className="rounded-md bg-sunk/60 font-paper">
          <StaticDoc doc={q.content} />
        </div>
      ) : null}
    </li>
  );
}

export function BankReport({ report, onClose }: { report: AddReport | null; onClose: () => void }) {
  return (
    <Dialog.Root open={report !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content className={`${dialogStyles} flex flex-col gap-4`}>
          <div>
            <Dialog.Title className="font-paper text-title font-semibold">
              {report?.added.length
                ? report.added.length === 1
                  ? "1 question added to the bank"
                  : `${report.added.length} questions added to the bank`
                : "Nothing was added to the bank"}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-small text-ink-2">
              The bank keeps its own copy; this paper is unchanged. Questions need a Bloom level and
              a CO to go into the bank.
            </Dialog.Description>
          </div>
          {report?.added.some((a) => a.warning) ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-small font-semibold">Added, with a note</h3>
              <ul className="flex flex-col gap-1 text-small">
                {report.added
                  .filter((a) => a.warning)
                  .map((a) => (
                    <li key={a.id}>
                      <span className="font-medium">{a.label}</span>:{" "}
                      <span className="text-caution">{a.warning}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {report?.skipped.length ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-small font-semibold">Skipped</h3>
              <ul className="flex max-h-[40dvh] flex-col gap-1 overflow-y-auto text-small">
                {report.skipped.map((s) => (
                  <li key={s.label} className="break-words [overflow-wrap:anywhere]">
                    <span className="font-medium">{s.label}</span>: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Dialog.Close className={buttonStyles.primary}>OK</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
