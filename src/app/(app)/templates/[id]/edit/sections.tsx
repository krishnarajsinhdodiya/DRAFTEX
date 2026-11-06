"use client";
// The builder's form sections. Each edits one part of the template through
// `edit`, which hands it a copy to change.
import { Plus } from "lucide-react";
import { useState } from "react";
import { buttonStyles } from "@/components/form";
import { CourseKind, ExamKind, Program } from "@/generated/prisma/enums";
import { questionNumbers } from "@/lib/paper/numbering";
import type { Group } from "@/lib/paper/schema";
import type { ParsedTemplateFields } from "@/lib/templates/fields";
import {
  CANDIDATE_LABEL,
  CO_TAG_LABEL,
  CO_TAG_STYLE_LABEL,
  COURSE_KIND_LABEL,
  EXAM_KIND_LABEL,
  GROUP_TYPE_LABEL,
  MARKS_STYLE_LABEL,
  NUMBERING_LABEL,
  OBJECTIVE_LAYOUT_LABEL,
  PROGRAM_LABEL,
  durationText,
  marksText,
} from "@/lib/templates/labels";
import { BUILT_IN_LOGOS } from "@/lib/templates/logos";
import {
  Check,
  ItemTools,
  NumberInput,
  Section,
  SelectInput,
  TextArea,
  TextInput,
  move,
} from "./controls";

export type Fields = ParsedTemplateFields;
export type Edit = (change: (draft: Fields) => void) => void;
/** Messages for a place in the template, e.g. "parts.0.groups.1". */
export type IssuesAt = (path: string) => string[];

const opts = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

const PLACEHOLDERS = [
  "university",
  "institute",
  "examTitle",
  "programLine",
  "courseTitle",
  "courseCode",
  "date",
  "duration",
  "maxMarks",
];

let counter = 0;
/** A key no other part or group in the template uses. */
function freshKey(prefix: string, taken: Set<string>): string {
  for (;;) {
    counter += 1;
    const k = `${prefix}${Date.now().toString(36).slice(-4)}${counter}`;
    if (!taken.has(k)) return k;
  }
}

function allKeys(f: Fields): Set<string> {
  return new Set(f.structure.parts.flatMap((p) => [p.key, ...p.groups.map((g) => g.key)]));
}

export function questionTotal(f: Fields): number {
  return f.structure.parts.reduce(
    (sum, p) => sum + p.groups.reduce((s, g) => s + g.attempt * g.marksEach, 0),
    0,
  );
}

// ---------- about ----------

export function AboutSection({ f, edit, issuesAt }: { f: Fields; edit: Edit; issuesAt: IssuesAt }) {
  const total = questionTotal(f);
  const totalOff = Math.abs(total - f.maxMarks) > 1e-9;
  return (
    <Section title="About" id="about">
      <TextInput
        label="Title"
        value={f.title}
        maxLength={200}
        error={issuesAt("title")[0]}
        onChange={(v) => edit((d) => void (d.title = v))}
      />
      <TextArea
        label="Description"
        rows={2}
        value={f.description}
        hint="Optional. Shown in the library."
        onChange={(v) => edit((d) => void (d.description = v.slice(0, 2000)))}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectInput
          label="Program"
          value={f.program}
          options={opts(PROGRAM_LABEL)}
          onChange={(v) => edit((d) => void (d.program = Program[v]))}
        />
        <SelectInput
          label="Exam"
          value={f.examKind}
          options={opts(EXAM_KIND_LABEL)}
          onChange={(v) => edit((d) => void (d.examKind = ExamKind[v]))}
        />
        <SelectInput
          label="Course type"
          value={f.courseKind}
          options={opts(COURSE_KIND_LABEL)}
          onChange={(v) => edit((d) => void (d.courseKind = CourseKind[v]))}
        />
        <SelectInput
          label="Credits"
          value={f.creditTier === null ? "" : String(f.creditTier)}
          options={[
            { value: "", label: "Not set" },
            { value: "1", label: "1 credit" },
            { value: "2", label: "2 credits" },
            { value: "3", label: "3 credits" },
            { value: "4", label: "4 credits" },
          ]}
          onChange={(v) => edit((d) => void (d.creditTier = v === "" ? null : Number(v)))}
        />
        <NumberInput
          label="Duration (minutes)"
          value={f.durationMinutes}
          min={1}
          max={600}
          integer
          hint={durationText(f.durationMinutes)}
          onChange={(v) => edit((d) => void (d.durationMinutes = v))}
        />
        <NumberInput
          label="Paper out of (marks)"
          value={f.maxMarks}
          min={0.5}
          max={1000}
          step={0.5}
          error={totalOff ? `The questions add up to ${marksText(total)}.` : undefined}
          onChange={(v) => edit((d) => void (d.maxMarks = v))}
        />
      </div>
      {totalOff && total > 0 ? (
        <div>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => edit((d) => void (d.maxMarks = total))}
          >
            Make the paper out of {marksText(total)}
          </button>
        </div>
      ) : null}
    </Section>
  );
}

// ---------- header ----------

export function HeaderSection({ f, edit }: { f: Fields; edit: Edit }) {
  const h = f.header;
  const logo = BUILT_IN_LOGOS.find((l) => l.sha256 === h.logoLeft?.sha256)?.id ?? "";
  return (
    <Section title="Header" id="header">
      <p className="text-caption text-ink-2">
        Header lines may use these fields, filled in on each paper:{" "}
        {PLACEHOLDERS.map((p, i) => (
          <span key={p}>
            <code className="rounded bg-sunk px-1">{`{{${p}}}`}</code>
            {i < PLACEHOLDERS.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
      <ol className="flex flex-col gap-3">
        {h.lines.map((line, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-lg border border-rule p-3">
            <div className="flex items-end gap-2">
              <TextInput
                className="flex-1"
                label={`Line ${i + 1}`}
                value={line.text}
                maxLength={200}
                error={line.text.trim() === "" ? "Write something or remove the line." : undefined}
                onChange={(v) => edit((d) => void ((d.header.lines[i] as typeof line).text = v))}
              />
              <ItemTools
                name={`line ${i + 1}`}
                index={i}
                count={h.lines.length}
                minCount={1}
                onMove={(to) => edit((d) => void (d.header.lines = move(d.header.lines, i, to)))}
                onRemove={() => edit((d) => void d.header.lines.splice(i, 1))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <SelectInput
                label="Size"
                className="w-32"
                value={line.size}
                options={[
                  { value: "small", label: "Small" },
                  { value: "normal", label: "Normal" },
                  { value: "large", label: "Large" },
                ]}
                onChange={(v) => edit((d) => void ((d.header.lines[i] as typeof line).size = v))}
              />
              <Check
                label="Bold"
                checked={line.bold}
                onChange={(v) => edit((d) => void ((d.header.lines[i] as typeof line).bold = v))}
              />
            </div>
          </li>
        ))}
      </ol>
      {h.lines.length < 8 ? (
        <div>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() =>
              edit(
                (d) =>
                  void d.header.lines.push({
                    text: "{{courseTitle}}",
                    size: "normal",
                    bold: false,
                    ownLeading: false,
                  }),
              )
            }
          >
            <Plus aria-hidden size={16} />
            Add a line
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <SelectInput
          label="Logo on the left"
          value={logo}
          options={[
            { value: "", label: "None" },
            ...BUILT_IN_LOGOS.map((l) => ({ value: l.id, label: l.label })),
          ]}
          onChange={(v) =>
            edit((d) => {
              const l = BUILT_IN_LOGOS.find((x) => x.id === v);
              d.header.logoLeft = l ? { sha256: l.sha256, ext: l.ext } : undefined;
            })
          }
        />
        <SelectInput
          label="Candidate number"
          value={h.candidateField}
          options={opts(CANDIDATE_LABEL)}
          onChange={(v) => edit((d) => void (d.header.candidateField = v))}
        />
        <SelectInput
          label="Page numbers"
          value={h.pageNumbers}
          options={[
            { value: "NONE", label: "None" },
            { value: "X_OF_Y", label: "1/2, 2/2" },
          ]}
          onChange={(v) => edit((d) => void (d.header.pageNumbers = v))}
        />
        <SelectInput
          label="Date row"
          value={h.dateRow.style}
          options={[
            { value: "RULE", label: "Line below" },
            { value: "ULINE", label: "Underlined" },
            { value: "NONE", label: "Hidden" },
          ]}
          onChange={(v) => edit((d) => void (d.header.dateRow.style = v))}
        />
      </div>
      {h.dateRow.style !== "NONE" ? (
        <div className="grid grid-cols-3 gap-2">
          {(["left", "centre", "right"] as const).map((side) => (
            <TextInput
              key={side}
              label={side === "left" ? "Left" : side === "centre" ? "Middle" : "Right"}
              value={h.dateRow[side]}
              maxLength={80}
              onChange={(v) => edit((d) => void (d.header.dateRow[side] = v))}
            />
          ))}
        </div>
      ) : null}
      <InstructionsField
        value={h.instructions}
        onChange={(lines) => edit((d) => void (d.header.instructions = lines))}
      />
    </Section>
  );
}

/** Free typing in a textarea; only non-empty lines become instructions. */
function InstructionsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (lines: string[]) => void;
}) {
  const [draft, setDraft] = useState(value.join("\n"));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (clean(draft).join("\n") !== value.join("\n")) setDraft(value.join("\n"));
  }
  return (
    <TextArea
      label="Instructions"
      rows={3}
      value={draft}
      hint="One instruction per line, up to 12."
      onChange={(v) => {
        setDraft(v);
        onChange(clean(v));
      }}
    />
  );
}

function clean(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 12);
}

// ---------- questions ----------

const GROUP_TYPES = opts(GROUP_TYPE_LABEL);

function newGroup(key: string): Group {
  return {
    key,
    type: "SHORT",
    heading: "Answer the following questions.",
    slots: 5,
    attempt: 5,
    marksEach: 2,
    showCoTag: "SLOT",
  };
}

export function QuestionsSection({
  f,
  edit,
  issuesAt,
}: {
  f: Fields;
  edit: Edit;
  issuesAt: IssuesAt;
}) {
  const s = f.structure;
  const multi = s.parts.length > 1;
  // Numbers run straight through the sections, as on the paper.
  const numbers = new Map(questionNumbers(s).map((n) => [n.key, n]));
  const nameOf = (g: Group) => {
    const n = numbers.get(g.key);
    if (!n) return "";
    if (n.label) return n.label;
    const first = n.printed[0] ?? "";
    const last = n.printed[n.printed.length - 1] ?? "";
    return first === last ? first : `${first}–${last}`;
  };
  return (
    <Section title="Questions" id="questions">
      <div className="grid grid-cols-2 gap-3">
        <SelectInput
          label="Numbering"
          value={
            s.numbering.prefix === "Q." || s.numbering.prefix === "Q:" ? s.numbering.prefix : "Q."
          }
          options={[
            { value: "Q.", label: "Q.1, Q.2" },
            { value: "Q:", label: "Q:1, Q:2" },
          ]}
          onChange={(v) => edit((d) => void (d.structure.numbering = { prefix: v, separator: "" }))}
        />
        <SelectInput
          label="Marks shown as"
          value={s.marksStyle}
          options={opts(MARKS_STYLE_LABEL)}
          onChange={(v) => edit((d) => void (d.structure.marksStyle = v))}
        />
      </div>

      {s.parts.map((part, p) => (
        <div
          key={part.key}
          className={multi ? "flex flex-col gap-3 rounded-xl bg-sunk p-3" : "flex flex-col gap-3"}
        >
          {multi ? (
            <div className="flex items-end gap-2">
              <TextInput
                className="flex-1"
                label={`Section ${p + 1} title`}
                value={part.title ?? ""}
                maxLength={100}
                placeholder="SECTION I"
                onChange={(v) =>
                  edit((d) => void ((d.structure.parts[p] as typeof part).title = v || undefined))
                }
              />
              <ItemTools
                name={`section ${p + 1}`}
                index={p}
                count={s.parts.length}
                minCount={1}
                onMove={(to) =>
                  edit((d) => void (d.structure.parts = move(d.structure.parts, p, to)))
                }
                onRemove={() => edit((d) => void d.structure.parts.splice(p, 1))}
              />
            </div>
          ) : null}
          {multi ? (
            <Check
              label="Answered on a separate answer sheet"
              checked={part.separateAnswerSheet}
              onChange={(v) =>
                edit((d) => void ((d.structure.parts[p] as typeof part).separateAnswerSheet = v))
              }
            />
          ) : null}

          <ol className="flex flex-col gap-3">
            {part.groups.map((g, gi) => {
              const name = nameOf(g);
              const path = `parts.${p}.groups.${gi}`;
              const problems = issuesAt(path);
              const set = (change: (x: Group) => void) =>
                edit((d) => change((d.structure.parts[p] as typeof part).groups[gi] as Group));
              return (
                <li
                  key={g.key}
                  className={`flex flex-col gap-3 rounded-lg border bg-surface p-3 ${problems.length ? "border-danger" : "border-rule"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-small font-semibold">
                      {name}
                      <span className="ml-2 font-normal text-ink-2 tabular-nums">
                        {marksText(g.attempt * g.marksEach)} marks
                      </span>
                    </span>
                    <ItemTools
                      name={name}
                      index={gi}
                      count={part.groups.length}
                      minCount={1}
                      onMove={(to) =>
                        edit((d) => {
                          const target = d.structure.parts[p] as typeof part;
                          target.groups = move(target.groups, gi, to);
                        })
                      }
                      onRemove={() =>
                        edit((d) => void (d.structure.parts[p] as typeof part).groups.splice(gi, 1))
                      }
                    />
                  </div>
                  <TextInput
                    label="Heading"
                    hint={
                      g.numbering === "QUESTION"
                        ? "Not printed: each question shows its own number and marks."
                        : undefined
                    }
                    value={g.heading}
                    maxLength={300}
                    error={
                      g.heading.trim() === ""
                        ? "Write the heading the students will read."
                        : undefined
                    }
                    onChange={(v) => set((x) => void (x.heading = v))}
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <SelectInput
                      className="col-span-2 sm:col-span-4"
                      label="Kind of questions"
                      value={g.type}
                      options={GROUP_TYPES}
                      onChange={(v) => set((x) => void (x.type = v))}
                    />
                    <NumberInput
                      label="Questions"
                      value={g.slots}
                      min={1}
                      max={100}
                      integer
                      onChange={(v) =>
                        set((x) => {
                          x.slots = v;
                          if (x.compulsory) x.attempt = v;
                        })
                      }
                    />
                    <NumberInput
                      label="To answer"
                      value={g.attempt}
                      min={1}
                      max={100}
                      integer
                      onChange={(v) => set((x) => void (x.attempt = v))}
                    />
                    <NumberInput
                      label="Marks each"
                      value={g.marksEach}
                      min={0.5}
                      max={100}
                      step={0.5}
                      onChange={(v) => set((x) => void (x.marksEach = v))}
                    />
                    <SelectInput
                      label="CO tags"
                      value={g.showCoTag}
                      options={opts(CO_TAG_LABEL)}
                      onChange={(v) => set((x) => void (x.showCoTag = v))}
                    />
                    <SelectInput
                      className="col-span-2 sm:col-span-4"
                      label="Numbering"
                      value={g.numbering ?? "GROUP"}
                      options={opts(NUMBERING_LABEL)}
                      onChange={(v) =>
                        set((x) => void (x.numbering = v === "GROUP" ? undefined : v))
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <Check
                      label="All questions compulsory"
                      checked={g.compulsory ?? false}
                      onChange={(v) =>
                        set((x) => {
                          x.compulsory = v || undefined;
                          if (v) x.attempt = x.slots;
                        })
                      }
                    />
                    {g.type === "OBJECTIVE" ? (
                      <SelectInput
                        label="Choices laid out in"
                        className="w-40"
                        value={g.objectiveLayout ?? "TWO_COLUMN"}
                        options={opts(OBJECTIVE_LAYOUT_LABEL)}
                        onChange={(v) => set((x) => void (x.objectiveLayout = v))}
                      />
                    ) : null}
                  </div>
                  {problems.length ? (
                    <ul className="flex flex-col gap-1 text-small text-danger" role="list">
                      {problems.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonStyles.secondary}
              onClick={() =>
                edit(
                  (d) =>
                    void (d.structure.parts[p] as typeof part).groups.push(
                      newGroup(freshKey("g", allKeys(d))),
                    ),
                )
              }
            >
              <Plus aria-hidden size={16} />
              Add a question group{multi ? ` to section ${p + 1}` : ""}
            </button>
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          className={buttonStyles.quiet}
          onClick={() =>
            edit((d) => {
              const keys = allKeys(d);
              const roman = ["I", "II", "III", "IV", "V", "VI"][d.structure.parts.length] ?? "";
              if (d.structure.parts.length === 1 && !d.structure.parts[0]?.title) {
                (d.structure.parts[0] as (typeof d.structure.parts)[number]).title = "SECTION I";
              }
              d.structure.parts.push({
                key: freshKey("p", keys),
                title: `SECTION ${roman}`.trim(),
                separateAnswerSheet: false,
                groups: [newGroup(freshKey("g", keys))],
              });
            })
          }
        >
          <Plus aria-hidden size={16} />
          Add a section
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="Closing line"
          value={s.footer.text}
          maxLength={100}
          placeholder="Best wishes"
          onChange={(v) => edit((d) => void (d.structure.footer.text = v))}
        />
        <SelectInput
          label="Row of asterisks"
          value={s.footer.ornament}
          options={[
            { value: "ASTERISKS", label: "Shown" },
            { value: "NONE", label: "Hidden" },
          ]}
          onChange={(v) => edit((d) => void (d.structure.footer.ornament = v))}
        />
      </div>
    </Section>
  );
}

// ---------- page layout ----------

export function PageSection({ f, edit }: { f: Fields; edit: Edit }) {
  const st = f.style;
  return (
    <Section title="Page" id="page">
      <Check
        label="Print the marks beside each question"
        checked={st.showMarksPerQuestion}
        onChange={(v) => edit((d) => void (d.style.showMarksPerQuestion = v))}
      />
      <Check
        label="Print the Bloom level after each question"
        checked={st.showBloom}
        onChange={(v) => edit((d) => void (d.style.showBloom = v))}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectInput
          label="Text size"
          value={String(st.classSize) as "10" | "11" | "12"}
          options={[
            { value: "10", label: "10 pt" },
            { value: "11", label: "11 pt" },
            { value: "12", label: "12 pt" },
          ]}
          onChange={(v) => edit((d) => void (d.style.classSize = Number(v) as 10 | 11 | 12))}
        />
        <SelectInput
          label="CO tags printed"
          value={st.coTagStyle}
          options={opts(CO_TAG_STYLE_LABEL)}
          onChange={(v) => edit((d) => void (d.style.coTagStyle = v))}
        />
      </div>
      <details className="group rounded-lg border border-rule px-3 py-2">
        <summary className="cursor-pointer text-small font-medium">Margins and text area</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 pb-1">
          <NumberInput
            label="Left margin (inches)"
            value={st.geometry.left}
            min={0}
            max={5}
            step={0.05}
            onChange={(v) => edit((d) => void (d.style.geometry.left = v))}
          />
          <NumberInput
            label="Top margin (inches)"
            value={st.geometry.top}
            min={0}
            max={5}
            step={0.05}
            onChange={(v) => edit((d) => void (d.style.geometry.top = v))}
          />
          <NumberInput
            label="Text width (inches)"
            value={st.geometry.width}
            min={2}
            max={8.27}
            step={0.05}
            hint="A4 is 8.27 inches wide."
            onChange={(v) => edit((d) => void (d.style.geometry.width = v))}
          />
          <NumberInput
            label="Text height (inches)"
            value={st.geometry.height}
            min={2}
            max={11.69}
            step={0.05}
            hint="A4 is 11.69 inches tall."
            onChange={(v) => edit((d) => void (d.style.geometry.height = v))}
          />
          {f.header.logoLeft ? (
            <NumberInput
              label="Logo width (share of the line)"
              value={st.logoWidth}
              min={0.05}
              max={0.3}
              step={0.01}
              onChange={(v) => edit((d) => void (d.style.logoWidth = v))}
            />
          ) : null}
        </div>
      </details>
    </Section>
  );
}
