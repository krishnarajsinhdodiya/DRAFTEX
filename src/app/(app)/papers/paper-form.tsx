"use client";
// Paper details: shared by "New paper" and the editor's Details dialog.
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/form";
import { buttonStyles, dialogStyles, inputStyles } from "@/components/styles";
import type { CommandResult } from "@/server/template-commands";

export interface CourseChoice {
  id: string;
  code: string;
  title: string;
  semesterOrYear: number;
}

export interface PaperFormValues {
  title: string;
  courseId: string | null;
  courseCode: string;
  courseTitle: string;
  semesterOrYear: number;
  academicYear: string;
  examDate: string | null;
  /** Details only (D64): print "(Bloom: …)" after each question. */
  showBloom?: boolean;
}

/** "2026-27" for papers set before June, the usual Indian academic year. */
export function currentAcademicYear(now = new Date()): string {
  const y = now.getFullYear();
  const start = now.getMonth() >= 5 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function Row({
  label,
  children,
  hint,
}: {
  label: string;
  children: (id: string) => ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-small font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-caption text-ink-2">{hint}</p> : null}
    </div>
  );
}

export function PaperFormDialog({
  trigger,
  heading,
  description,
  initial,
  courses,
  unit,
  submitLabel,
  pendingLabel,
  onSubmit,
}: {
  trigger: ReactNode;
  heading: string;
  description: string;
  initial: PaperFormValues;
  courses: CourseChoice[];
  unit: "Semester" | "Year";
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (v: PaperFormValues) => Promise<CommandResult<unknown> | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (patch: Partial<PaperFormValues>) => setV((x) => ({ ...x, ...patch }));
  const missingTitle = v.title.trim() === "";
  const course = courses.find((c) => c.id === v.courseId);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(initial);
          setError(null);
          setTouched(false);
        }
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content className={dialogStyles}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (missingTitle) return;
              start(async () => {
                setError(null);
                try {
                  const r = await onSubmit({ ...v, title: v.title.trim() });
                  if (r && !r.ok) return setError(r.message);
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  // redirect() from a server action arrives as a thrown navigation; let it through.
                  if (err && typeof err === "object" && "digest" in err) throw err;
                  setError(
                    "DRAFTEX is not reachable. Check that it is still running, then try again.",
                  );
                }
              });
            }}
          >
            <div>
              <Dialog.Title className="font-paper text-title font-semibold">{heading}</Dialog.Title>
              <Dialog.Description className="mt-1 text-small text-ink-2">
                {description}
              </Dialog.Description>
            </div>
            <Row label="Title">
              {(id) => (
                <>
                  <input
                    id={id}
                    autoFocus
                    value={v.title}
                    maxLength={200}
                    onChange={(e) => set({ title: e.target.value })}
                    aria-invalid={touched && missingTitle ? true : undefined}
                    className={inputStyles}
                  />
                  {touched && missingTitle ? (
                    <span className="text-small text-danger">Give the paper a title.</span>
                  ) : null}
                </>
              )}
            </Row>
            <Row
              label="Course"
              hint={
                course
                  ? "Code, title and semester are filled from the 2026 syllabus. Change them if your paper differs."
                  : undefined
              }
            >
              {(id) => (
                <select
                  id={id}
                  value={v.courseId ?? ""}
                  onChange={(e) => {
                    // The syllabus fills defaults (D85); the fields below stay editable.
                    const c = courses.find((x) => x.id === e.target.value);
                    set(
                      c
                        ? {
                            courseId: c.id,
                            courseCode: c.code,
                            courseTitle: c.title,
                            semesterOrYear: c.semesterOrYear,
                          }
                        : { courseId: null },
                    );
                  }}
                  className={inputStyles}
                >
                  <option value="">Not from the syllabus (type below)</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.title}
                    </option>
                  ))}
                </select>
              )}
            </Row>
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <Row label="Course code">
                {(id) => (
                  <input
                    id={id}
                    value={v.courseCode}
                    maxLength={40}
                    onChange={(e) => set({ courseCode: e.target.value })}
                    className={inputStyles}
                  />
                )}
              </Row>
              <Row label="Course title">
                {(id) => (
                  <input
                    id={id}
                    value={v.courseTitle}
                    maxLength={200}
                    onChange={(e) => set({ courseTitle: e.target.value })}
                    className={inputStyles}
                  />
                )}
              </Row>
              <Row label={unit}>
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={1}
                    max={10}
                    value={v.semesterOrYear}
                    onChange={(e) =>
                      set({
                        semesterOrYear: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                      })
                    }
                    className={inputStyles}
                  />
                )}
              </Row>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Exam date">
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={v.examDate ?? ""}
                    onChange={(e) => set({ examDate: e.target.value || null })}
                    className={inputStyles}
                  />
                )}
              </Row>
              <Row label="Academic year">
                {(id) => (
                  <input
                    id={id}
                    value={v.academicYear}
                    maxLength={20}
                    placeholder="2026-27"
                    onChange={(e) => set({ academicYear: e.target.value })}
                    className={inputStyles}
                  />
                )}
              </Row>
            </div>
            {v.showBloom !== undefined ? (
              <label className="flex items-start gap-2 text-small text-ink">
                <input
                  type="checkbox"
                  checked={v.showBloom}
                  onChange={(e) => set({ showBloom: e.target.checked })}
                  className="mt-0.5 size-4 accent-accent"
                />
                <span>
                  <span className="font-medium">Print Bloom levels</span>
                  <span className="block text-caption text-ink-2">
                    Adds “(Bloom: Remember)” after each question, on the paper and the answer key.
                  </span>
                </span>
              </label>
            ) : null}
            {error ? <FormAlert kind="error">{error}</FormAlert> : null}
            <div className="flex justify-end gap-2">
              <Dialog.Close className={buttonStyles.secondary}>Cancel</Dialog.Close>
              <button type="submit" className={buttonStyles.primary} disabled={pending}>
                {pending ? pendingLabel : submitLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
