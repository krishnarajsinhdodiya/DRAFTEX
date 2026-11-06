"use client";
// The editor's Export (D32, D34, D55) and Duplicate as… (ATKT flow, D60) buttons.
import * as Dialog from "@radix-ui/react-dialog";
import { CopyPlus, FolderDown } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/form";
import { buttonStyles, dialogStyles, inputStyles } from "@/components/styles";
import type { ExamKind } from "@/generated/prisma/enums";
import type { Problem } from "@/lib/paper/problems";
import { nextAcademicYear } from "@/lib/paper/academic-year";
import { EXAM_KIND_LABEL } from "@/lib/templates/labels";
import { duplicatePaperAction } from "@/server/paper-actions";

type ExportState =
  | { step: "idle" | "working" }
  | { step: "confirm"; problems: Problem[] }
  | { step: "failed"; message: string; problems: Problem[] };

const UNREACHABLE = "DRAFTEX is not reachable. Check that it is still running, then try again.";

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "2026-11-04 Title.zip" from an RFC 5987 Content-Disposition header. */
function fileNameOf(header: string | null): string {
  const m = /filename\*=UTF-8''([^;]+)/.exec(header ?? "");
  return m?.[1] ? decodeURIComponent(m[1]) : "export.zip";
}

export function ExportButton({
  paperId,
  flush,
  onExported,
}: {
  paperId: string;
  /** Waits for every question to reach the server; false when some could not be saved. */
  flush: () => Promise<boolean>;
  /** The folder it went to, inside the data folder; shown in the editor, not in a dialog. */
  onExported: (folder: string) => void;
}) {
  const [state, setState] = useState<ExportState>({ step: "idle" });

  const run = async (confirmed: boolean) => {
    setState({ step: "working" });
    if (!(await flush())) {
      setState({
        step: "failed",
        message: "Some questions are not saved yet. Fix the ones marked “Not saved”, then export.",
        problems: [],
      });
      return;
    }
    let res: Response;
    try {
      res = await fetch(`/api/papers/${paperId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
      });
    } catch {
      setState({ step: "failed", message: UNREACHABLE, problems: [] });
      return;
    }
    if (res.ok) {
      save(await res.blob(), fileNameOf(res.headers.get("Content-Disposition")));
      setState({ step: "idle" });
      onExported(decodeURIComponent(res.headers.get("X-DX-Folder") ?? ""));
      return;
    }
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      problems?: Problem[];
    };
    if (res.status === 409) {
      setState({ step: "confirm", problems: body.problems ?? [] });
      return;
    }
    setState({
      step: "failed",
      message: body.message ?? "The paper could not be exported.",
      problems: body.problems ?? [],
    });
  };

  const open = state.step === "confirm" || state.step === "failed";
  return (
    <>
      <button
        type="button"
        className={buttonStyles.quiet}
        disabled={state.step === "working"}
        onClick={() => void run(false)}
        title="Save the paper, its answer key and their LaTeX in the exports folder, and download them"
      >
        <FolderDown size={15} aria-hidden />
        {state.step === "working" ? "Exporting…" : "Export"}
      </button>
      <Dialog.Root open={open} onOpenChange={(o) => !o && setState({ step: "idle" })}>
        <Dialog.Portal>
          <Dialog.Overlay className="dx-overlay fixed inset-0 z-50 bg-scrim" />
          <Dialog.Content className={`${dialogStyles} flex flex-col gap-4`}>
            {state.step === "confirm" ? (
              <>
                <div>
                  <Dialog.Title className="font-paper text-title font-semibold">
                    Export with these gaps?
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-small text-ink-2">
                    The paper and its key can be exported, but check these first.
                  </Dialog.Description>
                </div>
                <ProblemList problems={state.problems} />
                <div className="flex justify-end gap-2">
                  <Dialog.Close className={buttonStyles.secondary}>Cancel</Dialog.Close>
                  <button
                    type="button"
                    className={buttonStyles.primary}
                    onClick={() => void run(true)}
                  >
                    Export anyway
                  </button>
                </div>
              </>
            ) : state.step === "failed" ? (
              <>
                <Dialog.Title className="font-paper text-title font-semibold">
                  Not exported
                </Dialog.Title>
                <Dialog.Description asChild>
                  <div>
                    <FormAlert kind="error">{state.message}</FormAlert>
                  </div>
                </Dialog.Description>
                <ProblemList problems={state.problems} />
                <div className="flex justify-end">
                  <Dialog.Close className={buttonStyles.secondary}>Close</Dialog.Close>
                </div>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function ProblemList({ problems }: { problems: Problem[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-small">
      {problems.map((p, i) => (
        <li
          key={i}
          className={
            "rounded-md border-l-2 px-3 py-1.5 " +
            (p.level === "error"
              ? "border-danger bg-danger-soft"
              : "border-caution bg-caution-soft")
          }
        >
          {p.message}
        </li>
      ))}
    </ul>
  );
}

type CopyKind = "NEXT_YEAR" | "ATKT" | "OTHER";

/** "Duplicate as…" (D60): next academic year, ATKT copy, or a copy for any exam. */
export function DuplicateButton({
  paperId,
  title,
  examKind,
  academicYear,
}: {
  paperId: string;
  title: string;
  examKind: ExamKind;
  academicYear: string;
}) {
  const nextYear = nextAcademicYear(academicYear);
  const firstCopy: CopyKind = examKind === "END_SEMESTER" ? "ATKT" : "NEXT_YEAR";
  const suggested = (c: CopyKind, year: string) => {
    if (c === "ATKT") return `${title} (ATKT)`.slice(0, 200);
    if (c === "OTHER" || !year) return `${title} (copy)`.slice(0, 200);
    // A title that names the year gets the new one; otherwise the year is added.
    return (
      academicYear && title.includes(academicYear)
        ? title.replace(academicYear, year)
        : `${title} (${year})`
    ).slice(0, 200);
  };
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<CopyKind>(firstCopy);
  const [kind, setKind] = useState<ExamKind>(examKind);
  const [year, setYear] = useState(nextYear ?? "");
  const [name, setName] = useState(suggested(firstCopy, nextYear ?? ""));
  const [nameTouched, setNameTouched] = useState(false);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = { title: useId(), kind: useId(), date: useId(), year: useId(), copy: useId() };

  const choose = (c: CopyKind) => {
    setCopy(c);
    if (!nameTouched) setName(suggested(c, year));
  };

  const choices: { value: CopyKind; label: string; hint: string }[] = [
    {
      value: "NEXT_YEAR",
      label: "Next academic year",
      hint: `The same ${EXAM_KIND_LABEL[examKind].toLowerCase()} paper for the next year.`,
    },
    {
      value: "ATKT",
      label: "ATKT copy",
      hint: "The supplementary (ATKT) version of this paper, for the same year.",
    },
    { value: "OTHER", label: "Another copy", hint: "Choose the exam yourself." },
  ];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setCopy(firstCopy);
          setKind(examKind);
          setYear(nextYear ?? "");
          setName(suggested(firstCopy, nextYear ?? ""));
          setNameTouched(false);
          setDate("");
          setError(null);
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={buttonStyles.quiet}
          title="Copy this paper with its questions and answer key"
        >
          <CopyPlus size={15} aria-hidden /> Duplicate as…
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content className={dialogStyles}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() === "") return setError("Give the copy a title.");
              start(async () => {
                setError(null);
                try {
                  const r = await duplicatePaperAction(paperId, {
                    title: name.trim(),
                    examKind:
                      copy === "ATKT" ? "SUPPLEMENTARY_ATKT" : copy === "OTHER" ? kind : examKind,
                    examDate: date || null,
                    ...(copy === "NEXT_YEAR" && { academicYear: year.trim() }),
                  });
                  if (r && !r.ok) setError(r.message);
                } catch (err) {
                  // redirect() from a server action arrives as a thrown navigation; let it through.
                  if (err && typeof err === "object" && "digest" in err) throw err;
                  setError(UNREACHABLE);
                }
              });
            }}
          >
            <div>
              <Dialog.Title className="font-paper text-title font-semibold">
                Duplicate as…
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-small text-ink-2">
                The copy has every question and answer of this paper and opens as a draft with no
                exam date.
              </Dialog.Description>
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-small font-medium text-ink">Make</legend>
              {choices.map((c) => (
                <label
                  key={c.value}
                  className={
                    "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 " +
                    (copy === c.value ? "border-accent bg-accent-soft/50" : "border-rule")
                  }
                >
                  <input
                    type="radio"
                    name={ids.copy}
                    value={c.value}
                    checked={copy === c.value}
                    onChange={() => choose(c.value)}
                    className="mt-1 accent-[var(--color-accent)]"
                  />
                  <span className="flex flex-col">
                    <span className="text-small font-medium text-ink">{c.label}</span>
                    <span className="text-caption text-ink-2">{c.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {copy === "NEXT_YEAR" ? (
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.year} className="text-small font-medium text-ink">
                  Academic year of the copy
                </label>
                <input
                  id={ids.year}
                  value={year}
                  maxLength={20}
                  placeholder="2027-28"
                  onChange={(e) => {
                    setYear(e.target.value);
                    if (!nameTouched) setName(suggested("NEXT_YEAR", e.target.value.trim()));
                  }}
                  className={inputStyles}
                  aria-describedby={nextYear ? undefined : `${ids.year}-hint`}
                />
                {nextYear ? null : (
                  <p id={`${ids.year}-hint`} className="text-caption text-ink-2">
                    {academicYear
                      ? `“${academicYear}” is not written like 2026-27, so type the next year.`
                      : "This paper has no academic year, so type the copy's."}
                  </p>
                )}
              </div>
            ) : null}
            {copy === "OTHER" ? (
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.kind} className="text-small font-medium text-ink">
                  Exam
                </label>
                <select
                  id={ids.kind}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ExamKind)}
                  className={inputStyles}
                >
                  {Object.entries(EXAM_KIND_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.title} className="text-small font-medium text-ink">
                Title of the copy
              </label>
              <input
                id={ids.title}
                value={name}
                maxLength={200}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
                className={inputStyles}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.date} className="text-small font-medium text-ink">
                Exam date <span className="font-normal text-ink-3">(optional)</span>
              </label>
              <input
                id={ids.date}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputStyles}
              />
            </div>
            {error ? <FormAlert kind="error">{error}</FormAlert> : null}
            <div className="flex justify-end gap-2">
              <Dialog.Close className={buttonStyles.secondary}>Cancel</Dialog.Close>
              <button type="submit" className={buttonStyles.primary} disabled={pending}>
                {pending ? "Copying…" : "Make the copy"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
