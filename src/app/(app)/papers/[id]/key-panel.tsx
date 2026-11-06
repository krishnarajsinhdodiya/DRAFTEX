"use client";
// A question's answer key (D24, D33): the model answer and its split-up
// marks, folded away under the question until opened. Saves with the
// question (one autosave), so moving or undoing a question carries its key.
import { ChevronRight, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import {
  type EditorHandle,
  QuestionEditor,
  type Uploader,
} from "@/components/editor/question-editor";
import { inputStyles } from "@/components/styles";
import {
  type KeyCriterion,
  choiceAnswers,
  criteriaNote,
  criteriaTotal,
  hasContent,
  marksNumber,
} from "@/lib/paper/key";
import type { Problem } from "@/lib/paper/problems";
import type { Doc } from "@/lib/paper/schema";
import type { SlotState, SlotValue } from "./use-paper";

const EMPTY_DOC: Doc = { type: "doc", content: [] };

const iconButton =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-sunk hover:text-ink " +
  "focus-visible:outline-2 focus-visible:outline-accent";

/** One line under the question: what the key holds so far. */
export function keySummary(state: Pick<SlotValue, "doc" | "answerKey" | "keyCriteria">): string {
  const letters = choiceAnswers(state.doc);
  const bits: string[] = [];
  if (letters.length) {
    bits.push(
      letters.every((l) => l === null)
        ? "no correct option chosen"
        : `correct: ${letters.map((l) => l ?? "?").join(", ")}`,
    );
  }
  if (hasContent(state.answerKey)) bits.push("model answer written");
  const rows = state.keyCriteria.filter((c) => c.text.trim() !== "").length;
  if (rows) bits.push(`${rows} split-up ${rows === 1 ? "row" : "rows"}`);
  return bits.length ? bits.join(" · ") : "not written yet";
}

export function KeyPanel({
  name,
  state,
  splitUp,
  problems,
  allowAdvanced,
  upload,
  onChange,
  onEditorFocus,
}: {
  name: string;
  state: SlotState;
  /** Objective groups print as one answer table, without split-up marks. */
  splitUp: boolean;
  problems: Problem[];
  allowAdvanced: boolean;
  upload: Uploader;
  onChange: (patch: Partial<SlotValue>) => void;
  onEditorFocus: (handle: EditorHandle) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editorProblem, setEditorProblem] = useState<string | null>(null);
  const bodyId = useId();
  const criteria = state.keyCriteria;
  const letters = choiceAnswers(state.doc);
  const note = criteriaNote(
    criteria.filter((c) => c.text.trim() !== ""),
    state.marks,
  );
  const errors = problems.filter((p) => p.level === "error");

  const setRow = (i: number, patch: Partial<KeyCriterion>) =>
    onChange({ keyCriteria: criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="border-t border-rule/70 px-3 py-1 pl-9 sm:pl-12">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded py-0.5 text-left text-caption text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ChevronRight
          size={14}
          aria-hidden
          className={`shrink-0 transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
        />
        <span className="font-medium">Answer key</span>
        <span className={errors.length ? "text-danger" : "text-ink-3"}>
          · {errors.length ? "needs a change" : keySummary(state)}
        </span>
      </button>

      {open ? (
        <div id={bodyId} className="flex flex-col gap-3 pt-1 pb-2">
          {letters.length ? (
            <p className="text-caption text-ink-2">
              {letters.every((l) => l === null)
                ? "Tick the correct option in the question; the key takes it from there."
                : `The key prints option ${letters.map((l) => l ?? "?").join(", ")} as the answer. Add an explanation below if you want one.`}
            </p>
          ) : null}

          <div className="rounded-md border border-rule bg-surface">
            <QuestionEditor
              initial={state.answerKey ?? EMPTY_DOC}
              label={`Model answer for ${name}`}
              placeholder="Type the model answer: the points, working or diagram you expect."
              allowAdvanced={allowAdvanced}
              upload={upload}
              onProblem={setEditorProblem}
              onChange={(doc) => onChange({ answerKey: hasContent(doc) ? doc : null })}
              onFocus={onEditorFocus}
            />
          </div>
          {editorProblem ? (
            <p role="alert" className="text-caption text-danger">
              {editorProblem}
            </p>
          ) : null}

          {splitUp ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-caption font-medium text-ink-2">Split-up marks</legend>
              {criteria.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <textarea
                    aria-label={`What earns marks, row ${i + 1}`}
                    value={c.text}
                    maxLength={300}
                    rows={1}
                    placeholder="e.g. Labelled diagram"
                    onChange={(e) => setRow(i, { text: e.target.value.replace(/\n/g, " ") })}
                    // Grows with its text, so a long criterion stays readable in full.
                    className={`${inputStyles} field-sizing-content h-auto min-h-8 min-w-0 flex-1 resize-none py-1.5 text-small`}
                  />
                  <input
                    aria-label={`Marks for row ${i + 1}`}
                    type="number"
                    min={0}
                    max={100}
                    step={0.25}
                    value={c.marks}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v >= 0 && v <= 100) setRow(i, { marks: v });
                    }}
                    className={`${inputStyles} h-8 w-20 text-right font-paper tabular-nums`}
                  />
                  <button
                    type="button"
                    className={iconButton}
                    aria-label={`Remove row ${i + 1}`}
                    onClick={() => onChange({ keyCriteria: criteria.filter((_, j) => j !== i) })}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={criteria.length >= 20}
                  onClick={() => onChange({ keyCriteria: [...criteria, { text: "", marks: 1 }] })}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-caption font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  <Plus size={14} aria-hidden /> Add a row
                </button>
                {criteria.length >= 20 ? (
                  <span className="text-caption text-ink-3">
                    20 rows is the most a question can have.
                  </span>
                ) : null}
                {criteria.length ? (
                  <span className="ml-auto text-caption text-ink-2 tabular-nums">
                    Total {marksNumber(criteriaTotal(criteria))} of {marksNumber(state.marks)}
                  </span>
                ) : null}
              </div>
              {note ? <p className="text-caption text-caution">{note}</p> : null}
              {criteria.some((c) => c.text.trim() === "") ? (
                <p className="text-caption text-ink-3">Rows without a description are not saved.</p>
              ) : null}
            </fieldset>
          ) : null}

          {errors.length ? (
            <ul className="flex flex-col gap-0.5 text-caption">
              {errors.map((p, i) => (
                <li key={i} className="text-danger">
                  {p.message.replace(/^(Q\.[^ ]+)/, "The answer to $1")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
