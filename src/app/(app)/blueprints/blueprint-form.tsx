"use client";
// Blueprint editor (Phase 15, D108): course code, exam (D134), marks or
// percent, tolerance, and one target per CO. The same Zod rules as the data
// layer run as the user types, so a save never surprises.
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { FormAlert } from "@/components/form";
import { buttonStyles, eyebrowStyles, inputStyles, sheetStyles } from "@/components/styles";
import { BLUEPRINT_MAX_TARGETS, blueprintFieldsSchema } from "@/lib/blueprint/schema";
import { cleanCoTagInput, CO_TAG_MAX } from "@/lib/paper/co-tag";
import type { ExamKind } from "@/generated/prisma/enums";
import { EXAM_KIND_LABEL, EXAM_KINDS, marksText } from "@/lib/templates/labels";
import { saveBlueprintAction } from "@/server/blueprint-actions";
import type { BlueprintCourse } from "@/server/blueprint-commands";

export interface BlueprintFormValues {
  courseCode: string;
  examKind: ExamKind;
  unit: "MARKS" | "PERCENT";
  tolerance: number;
  targets: { co: string; target: number | null }[];
}

export const NEW_BLUEPRINT: BlueprintFormValues = {
  courseCode: "",
  examKind: "SESSIONAL_1",
  unit: "MARKS",
  tolerance: 1,
  targets: [{ co: "", target: null }],
};

export function BlueprintForm({
  id,
  version,
  initial,
  courses,
}: {
  id: string | null;
  version: number;
  initial: BlueprintFormValues;
  courses: BlueprintCourse[];
}) {
  const ids = useId();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<BlueprintFormValues>) => setV((x) => ({ ...x, ...patch }));
  const setRow = (i: number, patch: Partial<BlueprintFormValues["targets"][number]>) =>
    set({ targets: v.targets.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const course = courses.find((c) => c.code === v.courseCode.trim().toUpperCase());
  const parsed = useMemo(
    () =>
      blueprintFieldsSchema.safeParse({
        ...v,
        courseCode: v.courseCode,
        targets: v.targets.map((r) => ({ co: r.co.trim(), target: r.target ?? NaN })),
      }),
    [v],
  );
  const sum = v.targets.reduce((a, r) => a + (r.target ?? 0), 0);
  const unitLabel = v.unit === "PERCENT" ? "%" : "marks";

  function fillFromSyllabus() {
    if (!course) return;
    const share = v.unit === "PERCENT" ? Number((100 / course.cos.length).toFixed(2)) : null;
    set({ targets: course.cos.map((c) => ({ co: c.value, target: share })) });
  }

  function save() {
    if (!parsed.success) return;
    start(async () => {
      setError(null);
      const r = await saveBlueprintAction(id, version, parsed.data);
      if (r.ok) router.push(`/blueprints/${r.value.id}?saved=1`);
      else setError([r.message, ...(r.issues ?? []).map((i) => i.message)].join(" "));
    });
  }

  const problems = parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.message))];
  const label = "flex min-w-0 flex-col gap-1 text-small font-medium text-ink";

  return (
    <form
      className={`${sheetStyles} flex flex-col gap-5 p-5`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Course code
          <input
            value={v.courseCode}
            onChange={(e) => set({ courseCode: e.target.value })}
            list={`${ids}-courses`}
            maxLength={26}
            autoComplete="off"
            spellCheck={false}
            placeholder="BP604T"
            className={`${inputStyles} w-full uppercase`}
          />
          <datalist id={`${ids}-courses`}>
            {courses.map((c) => (
              <option key={c.code} value={c.code} label={c.title} />
            ))}
          </datalist>
          {course ? (
            <span className="text-caption font-normal text-ink-2">{course.title}</span>
          ) : null}
        </label>
        <label className={label}>
          Exam
          <select
            value={v.examKind}
            onChange={(e) => set({ examKind: e.target.value as ExamKind })}
            className={`${inputStyles} w-full`}
          >
            {EXAM_KINDS.map((g) => (
              <option key={g} value={g}>
                {EXAM_KIND_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="text-small font-medium text-ink">Targets in</legend>
          <div className="flex gap-4 text-body">
            {(["MARKS", "PERCENT"] as const).map((u) => (
              <label key={u} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`${ids}-unit`}
                  checked={v.unit === u}
                  onChange={() => set({ unit: u })}
                />
                {u === "MARKS" ? "Marks" : "Percent of the paper"}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={label}>
          Allowed difference (±{v.unit === "PERCENT" ? "%" : "marks"})
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={v.tolerance}
            onChange={(e) => set({ tolerance: Number(e.target.value) })}
            className={`${inputStyles} w-32 text-right tabular-nums`}
          />
        </label>
      </div>

      <section aria-labelledby={`${ids}-targets`} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${ids}-targets`} className={eyebrowStyles}>
            Target per CO
          </h2>
          {course?.cos.length ? (
            <button type="button" className={buttonStyles.quiet} onClick={fillFromSyllabus}>
              Fill from syllabus ({course.cos.length} COs)
            </button>
          ) : null}
        </div>
        <datalist id={`${ids}-cos`}>
          {(course?.cos ?? []).map((c) => (
            <option key={c.value} value={c.value} label={c.label} />
          ))}
        </datalist>
        <ul className="flex flex-col gap-2">
          {v.targets.map((r, i) => (
            <li key={i} className="flex min-w-0 flex-wrap items-center gap-2">
              <input
                aria-label={`CO ${i + 1}`}
                value={r.co}
                list={`${ids}-cos`}
                maxLength={CO_TAG_MAX}
                autoComplete="off"
                spellCheck={false}
                placeholder={course?.cos[i]?.value ?? "BP604T.01"}
                onChange={(e) => setRow(i, { co: cleanCoTagInput(e.target.value) })}
                className={`${inputStyles} w-48 min-w-0 flex-1 sm:flex-none`}
              />
              <input
                aria-label={`Target for CO ${i + 1} (${unitLabel})`}
                type="number"
                min={0}
                max={v.unit === "PERCENT" ? 100 : 500}
                step={0.5}
                value={r.target ?? ""}
                onChange={(e) =>
                  setRow(i, { target: e.target.value === "" ? null : Number(e.target.value) })
                }
                className={`${inputStyles} w-24 text-right tabular-nums`}
              />
              <span className="text-small text-ink-2">{unitLabel}</span>
              <button
                type="button"
                aria-label={`Remove CO ${i + 1}`}
                disabled={v.targets.length === 1}
                className={buttonStyles.quiet}
                onClick={() => set({ targets: v.targets.filter((_, j) => j !== i) })}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={v.targets.length >= BLUEPRINT_MAX_TARGETS}
            className={buttonStyles.quiet}
            onClick={() => set({ targets: [...v.targets, { co: "", target: null }] })}
          >
            <Plus size={16} aria-hidden /> Add CO
          </button>
          <p className="text-small text-ink-2 tabular-nums">
            Total{" "}
            {v.unit === "PERCENT"
              ? `${marksText(Number(sum.toFixed(2)))}%`
              : `${marksText(sum)} marks`}
          </p>
        </div>
      </section>

      {problems.length && v.courseCode ? (
        <ul aria-live="polite" className="flex flex-col gap-1 text-small text-danger">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {error ? <FormAlert kind="error">{error}</FormAlert> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || !parsed.success}
          className={buttonStyles.primary}
        >
          {pending ? "Saving…" : "Save blueprint"}
        </button>
      </div>
      <p className="text-caption text-ink-3">
        The paper editor compares each paper of this course and exam with these targets. It never
        blocks an export and prints nothing.
      </p>
    </form>
  );
}
