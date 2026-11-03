"use client";
// One question on the paper: its number, the text (read-only until clicked,
// then a live editor), and in the marks margin its marks. Below: CO tag,
// Bloom level and the question's actions.
import { ArrowDown, ArrowUp, Copy, Eraser } from "lucide-react";
import { memo, useId, useState } from "react";
import { QuestionEditor, type Uploader } from "@/components/editor/question-editor";
import { StaticDoc } from "@/components/editor/static-doc";
import { inputStyles } from "@/components/styles";
import type { BloomLevel } from "@/generated/prisma/enums";
import { isEmptyDoc } from "@/lib/editor/convert";
import type { Problem } from "@/lib/paper/problems";
import { marksText } from "@/lib/templates/labels";
import type { EditorGroup } from "@/server/paper-view";
import type { SlotState, SlotValue } from "./use-paper";

export const BLOOM_LABEL: Record<BloomLevel, string> = {
  REMEMBER: "Remember",
  UNDERSTAND: "Understand",
  APPLY: "Apply",
  ANALYZE: "Analyse",
  EVALUATE: "Evaluate",
  CREATE: "Create",
};

const iconButton =
  "inline-flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-sunk hover:text-ink " +
  "focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

function statusText(s: SlotState): string | null {
  if (s.status === "pending" || s.status === "saving") return "Saving…";
  if (s.status === "error") return s.error ?? "Not saved.";
  return null;
}

export const SlotCard = memo(function SlotCard({
  slotKey,
  group,
  position,
  state,
  problems,
  coOptions,
  allowAdvanced,
  upload,
  active,
  onActivate,
  onChange,
  onMarks,
  onRetry,
  onClear,
  onMove,
  onDuplicate,
}: {
  slotKey: string;
  group: EditorGroup;
  position: number;
  state: SlotState;
  problems: Problem[];
  coOptions: { value: string; label: string }[];
  allowAdvanced: boolean;
  upload: Uploader;
  active: boolean;
  onActivate: (key: string) => void;
  onChange: (key: string, patch: Partial<SlotValue>) => void;
  onMarks: (key: string, marks: number) => void;
  onRetry: (key: string) => void;
  onClear: (key: string) => void;
  onMove: (key: string, by: -1 | 1) => void;
  onDuplicate: (key: string) => void;
}) {
  const name = group.slotLabels[position - 1] ?? slotKey;
  const printed = group.printed[position - 1] ?? `${position}.`;
  const empty = isEmptyDoc(state.doc);
  const [editorProblem, setEditorProblem] = useState<string | null>(null);
  const marksId = useId();
  const coId = useId();
  const bloomId = useId();
  const errors = problems.filter((p) => p.level === "error");
  const notes = problems.filter((p) => p.level === "note");
  const status = statusText(state);
  const changedMarks = state.marks !== group.marksEach;

  return (
    <li
      id={`q-${slotKey}`}
      aria-label={name}
      className={
        "group/slot relative scroll-mt-24 rounded-md border bg-surface transition-colors duration-150 " +
        (errors.length
          ? "border-danger"
          : active
            ? "border-accent/50 shadow-sheet"
            : "border-transparent hover:border-rule")
      }
    >
      <div className="flex items-stretch">
        <span className="w-12 shrink-0 pt-2 pl-3 font-paper text-body font-semibold text-ink">
          {printed}
        </span>
        <div className="min-w-0 flex-1">
          {active ? (
            <QuestionEditor
              initial={state.doc}
              label={`Text of ${name}`}
              allowAdvanced={allowAdvanced}
              upload={upload}
              onProblem={setEditorProblem}
              onChange={(doc) => onChange(slotKey, { doc })}
            />
          ) : (
            <button
              type="button"
              onClick={() => onActivate(slotKey)}
              className="block w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-accent"
              aria-label={empty ? `Write ${name}` : `Edit ${name}`}
            >
              {empty ? (
                <span className="block px-3 py-2 text-ink-3 italic">Click to write {name}</span>
              ) : (
                <StaticDoc doc={state.doc} defaultColumns={group.objectiveColumns} />
              )}
            </button>
          )}
        </div>
        <label
          htmlFor={marksId}
          className="dx-margin flex w-20 shrink-0 flex-col items-end gap-0.5 py-2 pr-3"
        >
          <span className="sr-only">Marks for {name}</span>
          <input
            id={marksId}
            type="number"
            min={0.5}
            max={100}
            step={0.5}
            value={state.marks}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0 && v <= 100) onMarks(slotKey, v);
            }}
            className="w-14 rounded border border-transparent bg-transparent text-right font-paper text-body font-semibold text-ink tabular-nums hover:border-rule focus:border-accent focus:outline-none"
          />
          <span className="font-sans text-caption text-ink-3">marks</span>
        </label>
      </div>

      {active || !empty || problems.length || status ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule/70 px-3 py-1.5 pl-12 text-caption text-ink-2">
          {group.showCoTag !== "NONE" ? (
            <label htmlFor={coId} className="flex items-center gap-1">
              CO
              {coOptions.length ? (
                <select
                  id={coId}
                  value={state.coTag ?? ""}
                  onChange={(e) => onChange(slotKey, { coTag: e.target.value || null })}
                  className={`${inputStyles} h-7 max-w-48 px-1 text-caption`}
                >
                  <option value="">None</option>
                  {coOptions.map((o) => (
                    <option key={o.value} value={o.value} title={o.label}>
                      {o.value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={coId}
                  value={state.coTag ?? ""}
                  placeholder="none"
                  pattern="[A-Za-z0-9.]{1,20}"
                  maxLength={20}
                  onChange={(e) =>
                    onChange(slotKey, {
                      coTag: e.target.value.replace(/[^A-Za-z0-9.]/g, "") || null,
                    })
                  }
                  className={`${inputStyles} h-7 w-28 px-1 text-caption`}
                />
              )}
            </label>
          ) : null}
          <label htmlFor={bloomId} className="flex items-center gap-1">
            Bloom
            <select
              id={bloomId}
              value={state.bloomLevel ?? ""}
              onChange={(e) =>
                onChange(slotKey, { bloomLevel: (e.target.value || null) as BloomLevel | null })
              }
              className={`${inputStyles} h-7 px-1 text-caption`}
            >
              <option value="">None</option>
              {Object.entries(BLOOM_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto flex items-center gap-0.5">
            {status ? (
              <span
                role="status"
                className={state.status === "error" ? "mr-2 text-danger" : "mr-2 text-ink-3"}
              >
                {status}
                {state.status === "error" ? (
                  <button
                    type="button"
                    onClick={() => onRetry(slotKey)}
                    className="ml-1 font-medium text-accent underline"
                  >
                    Try again
                  </button>
                ) : null}
              </span>
            ) : null}
            <button
              type="button"
              className={iconButton}
              aria-label={`Move ${name} up`}
              title="Move up"
              disabled={position === 1}
              onClick={() => onMove(slotKey, -1)}
            >
              <ArrowUp size={15} aria-hidden />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={`Move ${name} down`}
              title="Move down"
              disabled={position === group.slots}
              onClick={() => onMove(slotKey, 1)}
            >
              <ArrowDown size={15} aria-hidden />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={`Duplicate ${name}`}
              title="Duplicate into the next empty place"
              disabled={empty}
              onClick={() => onDuplicate(slotKey)}
            >
              <Copy size={15} aria-hidden />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={`Clear ${name}`}
              title="Clear (can be undone)"
              disabled={empty}
              onClick={() => onClear(slotKey)}
            >
              <Eraser size={15} aria-hidden />
            </button>
          </span>
        </div>
      ) : null}

      {changedMarks ? (
        <p className="px-3 pb-1.5 pl-12 text-caption text-caution">
          {name} is worth {marksText(state.marks)} instead of the group&apos;s{" "}
          {marksText(group.marksEach)}, so the group total changes.
        </p>
      ) : null}
      {editorProblem ? (
        <p role="alert" className="px-3 pb-1.5 pl-12 text-caption text-danger">
          {editorProblem}
        </p>
      ) : null}
      {errors.length || notes.length ? (
        <ul className="flex flex-col gap-0.5 px-3 pb-2 pl-12 text-caption">
          {[...errors, ...notes].map((p, i) => (
            <li key={i} className={p.level === "error" ? "text-danger" : "text-caution"}>
              {p.message}
              {p.raw ? (
                <details className="inline text-ink-3">
                  <summary className="ml-1 inline cursor-pointer underline">Details</summary>
                  <code className="block font-mono">{p.raw}</code>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
});
