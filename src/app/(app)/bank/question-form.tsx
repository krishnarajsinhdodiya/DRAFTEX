"use client";
// A bank question's form: course, unit, CO, Bloom, marks, type, tags, the
// question and its model answer, and whether colleagues see it. The syllabus
// fills defaults and suggestions only (D85); every field can be typed over.
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { CoTagInput } from "@/components/editor/co-tag-input";
import { type EditorHandle, QuestionEditor, Toolbar } from "@/components/editor/question-editor";
import { SubPartFieldsContext } from "@/components/editor/sub-part-fields";
import { upload } from "@/components/editor/upload";
import { FormAlert } from "@/components/form";
import { buttonStyles, eyebrowStyles, inputStyles, sheetStyles } from "@/components/styles";
import { isEmptyDoc } from "@/lib/editor/convert";
import { BANK_TYPES, type BankType } from "@/lib/bank/question";
import { BLOOM_LABEL, BLOOM_LEVELS, type Bloom } from "@/lib/paper/bloom";
import type { KeyCriterion } from "@/lib/paper/key";
import type { Doc } from "@/lib/paper/schema";
import { GROUP_TYPE_LABEL, PROGRAM_LABEL } from "@/lib/templates/labels";
import { saveQuestionAction, setQuestionSharingAction } from "@/server/bank-actions";
import type { CourseSuggestion } from "@/server/bank-commands";

const EMPTY_DOC: Doc = { type: "doc", content: [] };
const PROGRAMS = ["B_PHARM", "M_PHARM", "PHARM_D"] as const;
type Program = (typeof PROGRAMS)[number];

export interface QuestionFormValues {
  courseCode: string;
  courseTitle: string;
  program: Program;
  unit: string;
  coTag: string | null;
  bloomLevel: Bloom | "";
  marks: string;
  type: BankType;
  tags: string;
  content: Doc;
  answerKey: Doc | null;
  keyCriteria: KeyCriterion[] | null;
  shared: boolean;
}

export const NEW_QUESTION: QuestionFormValues = {
  courseCode: "",
  courseTitle: "",
  program: "B_PHARM",
  unit: "",
  coTag: null,
  bloomLevel: "",
  marks: "",
  type: "SHORT",
  tags: "",
  content: EMPTY_DOC,
  answerKey: null,
  keyCriteria: null,
  shared: false,
};

const label = "flex flex-col gap-1 text-small font-medium";

export function QuestionForm({
  id: initialId,
  version: initialVersion,
  initial,
  courses,
  allowAdvanced,
}: {
  id: string | null;
  version: number;
  initial: QuestionFormValues;
  courses: CourseSuggestion[];
  allowAdvanced: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const [v, setV] = useState(initial);
  const id = initialId;
  const [version, setVersion] = useState(initialVersion);
  const [savedShared, setSavedShared] = useState(initial.shared);
  const [focused, setFocused] = useState<EditorHandle | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null);
  const [notice, setNotice] = useState<{ warnings: string[]; duplicates: number } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<QuestionFormValues>) => {
    setV((x) => ({ ...x, ...patch }));
    setNotice(null);
  };
  const course = useMemo(
    () => courses.find((c) => c.code === v.courseCode.trim().toUpperCase()),
    [courses, v.courseCode],
  );

  const save = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      const fields = {
        courseCode: v.courseCode,
        courseTitle: v.courseTitle,
        program: v.program,
        unit: v.unit ? Number(v.unit) : null,
        coTag: v.coTag ?? "",
        bloomLevel: v.bloomLevel || undefined,
        marks: Number(v.marks),
        type: v.type,
        content: v.content,
        answerKey: v.answerKey && !isEmptyDoc(v.answerKey) ? v.answerKey : null,
        keyCriteria: v.keyCriteria,
        tags: v.tags
          .split(/[;,]/)
          .map((t) => t.trim())
          .filter(Boolean),
      };
      let r: Awaited<ReturnType<typeof saveQuestionAction>>;
      try {
        r = await saveQuestionAction(id, version, fields);
      } catch {
        setError({
          message: "DRAFTEX is not reachable. Check that it is still running, then try again.",
          issues: [],
        });
        return;
      }
      if (!r.ok) {
        setError({ message: r.message, issues: (r.issues ?? []).map((i) => i.message) });
        return;
      }
      if (v.shared !== savedShared) {
        const s = await setQuestionSharingAction(r.value.id, v.shared);
        if (s.ok) setSavedShared(v.shared);
        else setError({ message: s.message, issues: [] });
      }
      if (id === null) {
        // The question's own page says "Saved" and lists its warnings and duplicates.
        router.replace(`/bank/${r.value.id}?saved=1`);
        return;
      }
      setNotice({ warnings: r.value.warnings, duplicates: r.value.duplicates });
      setVersion(r.value.version);
      router.refresh();
    });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          save();
        }
      }}
    >
      <section className={`${sheetStyles} flex flex-col gap-4 p-5`} aria-labelledby={`${ids}-c`}>
        <h2 id={`${ids}-c`} className={eyebrowStyles}>
          Course and tags
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,9rem)]">
          <label className={label}>
            Course code
            <input
              value={v.courseCode}
              maxLength={40}
              list={`${ids}-courses`}
              autoComplete="off"
              required
              placeholder="BP604T"
              onChange={(e) => {
                const code = e.target.value;
                const c = courses.find((x) => x.code === code.trim().toUpperCase());
                // A syllabus course fills its title and programme as defaults (D85).
                set(
                  c && (!v.courseTitle || courses.some((x) => x.title === v.courseTitle))
                    ? { courseCode: code, courseTitle: c.title, program: c.program as Program }
                    : { courseCode: code },
                );
              }}
              className={inputStyles}
            />
            <datalist id={`${ids}-courses`}>
              {courses.map((c) => (
                <option key={c.code} value={c.code} label={c.title} />
              ))}
            </datalist>
          </label>
          <label className={label}>
            Course title
            <input
              value={v.courseTitle}
              maxLength={200}
              onChange={(e) => set({ courseTitle: e.target.value })}
              className={inputStyles}
            />
          </label>
          <label className={label}>
            Programme
            <select
              value={v.program}
              onChange={(e) => set({ program: e.target.value as Program })}
              className={inputStyles}
            >
              {PROGRAMS.map((p) => (
                <option key={p} value={p}>
                  {PROGRAM_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,5rem)_minmax(0,1.7fr)_minmax(0,1.1fr)_minmax(0,5.5rem)_minmax(0,1.3fr)]">
          <label className={label}>
            Unit
            <input
              type="number"
              min={1}
              max={20}
              value={v.unit}
              list={course?.units.length ? `${ids}-units` : undefined}
              placeholder="Any"
              onChange={(e) => set({ unit: e.target.value })}
              className={inputStyles}
            />
            {course?.units.length ? (
              <datalist id={`${ids}-units`}>
                {course.units.map((u) => (
                  <option key={u.value} value={u.value} label={u.label} />
                ))}
              </datalist>
            ) : null}
          </label>
          <label className={label}>
            CO
            <CoTagInput
              id={`${ids}-co`}
              label="CO"
              value={v.coTag}
              placeholder={course?.cos[0]?.value ?? "BP604T.01"}
              options={course?.cos ?? []}
              onChange={(coTag) => set({ coTag })}
              className={`${inputStyles} w-full`}
            />
          </label>
          <label className={label}>
            Bloom level
            <select
              value={v.bloomLevel}
              required
              onChange={(e) => set({ bloomLevel: e.target.value as Bloom | "" })}
              className={inputStyles}
            >
              <option value="">Choose…</option>
              {BLOOM_LEVELS.map((b) => (
                <option key={b} value={b}>
                  {BLOOM_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Marks
            <input
              type="number"
              min={0.5}
              max={100}
              step="any"
              required
              value={v.marks}
              onChange={(e) => set({ marks: e.target.value })}
              className={`${inputStyles} tabular-nums`}
            />
          </label>
          <label className={label}>
            Type
            <select
              value={v.type}
              onChange={(e) => set({ type: e.target.value as BankType })}
              className={inputStyles}
            >
              {BANK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {GROUP_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={label}>
          Tags
          <input
            value={v.tags}
            maxLength={340}
            placeholder="Separate tags with ; for example: kinetics; numerical"
            onChange={(e) => set({ tags: e.target.value })}
            className={inputStyles}
          />
        </label>
        <label className="flex items-start gap-2 text-small">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-accent)]"
            checked={v.shared}
            onChange={(e) => set({ shared: e.target.checked })}
          />
          <span>
            <span className="font-medium">Share with colleagues.</span>{" "}
            <span className="text-ink-2">
              Every colleague on this DRAFTEX can see and use it; only you can change it.
            </span>
          </span>
        </label>
      </section>

      <section className={`${sheetStyles} flex flex-col`} aria-labelledby={`${ids}-q`}>
        <div className="flex min-h-11 items-center border-b border-rule px-4">
          {focused && !focused.editor.isDestroyed ? (
            <Toolbar
              editor={focused.editor}
              allowAdvanced={allowAdvanced}
              onFile={focused.pickFile}
            />
          ) : (
            <p className="text-small text-ink-3">Press / in the question to insert.</p>
          )}
        </div>
        <div className="flex flex-col gap-4 p-5">
          <h2 id={`${ids}-q`} className={eyebrowStyles}>
            Question
          </h2>
          <div className="rounded-md border border-rule bg-surface">
            <SubPartFieldsContext.Provider
              value={{
                questionName: "the question",
                coOptions: course?.cos ?? [],
                showCo: true,
                questionCo: v.coTag,
                questionBloom: v.bloomLevel || null,
              }}
            >
              <QuestionEditor
                initial={initial.content}
                label="Question text"
                allowAdvanced={allowAdvanced}
                upload={upload}
                onProblem={setProblem}
                onChange={(content) => set({ content })}
                onFocus={setFocused}
              />
            </SubPartFieldsContext.Provider>
          </div>
          <h2 className={eyebrowStyles}>Model answer (optional)</h2>
          <div className="rounded-md border border-rule bg-surface">
            <QuestionEditor
              initial={initial.answerKey ?? EMPTY_DOC}
              label="Model answer"
              placeholder="Type the model answer: the points, working or diagram you expect."
              allowAdvanced={allowAdvanced}
              upload={upload}
              onProblem={setProblem}
              onChange={(doc) => set({ answerKey: isEmptyDoc(doc) ? null : doc })}
              onFocus={setFocused}
            />
          </div>
          {problem ? (
            <p role="alert" className="text-caption text-danger">
              {problem}
            </p>
          ) : null}
        </div>
      </section>

      {error ? (
        <FormAlert kind="error">
          {error.message}
          {error.issues.length ? (
            <ul className="mt-1 list-disc pl-5">
              {error.issues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </FormAlert>
      ) : null}
      {notice ? (
        <FormAlert kind={notice.warnings.length || notice.duplicates ? "caution" : "notice"}>
          Saved.
          {notice.duplicates ? (
            <>
              {" "}
              You already have{" "}
              {notice.duplicates === 1 ? "a question" : `${notice.duplicates} questions`} with the
              same text in this course (Trash included).
            </>
          ) : null}
          {notice.warnings.length ? (
            <ul className="mt-1 list-disc pl-5">
              {notice.warnings.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </FormAlert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending ? "Saving…" : id ? "Save changes" : "Add to bank"}
        </button>
        <span className="text-small text-ink-3">Ctrl+S saves</span>
      </div>
    </form>
  );
}
