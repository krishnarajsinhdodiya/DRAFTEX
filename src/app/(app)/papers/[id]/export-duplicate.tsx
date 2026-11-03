"use client";
// The editor's Export (D32, D34) and Duplicate (ATKT flow) buttons.
import * as Dialog from "@radix-ui/react-dialog";
import { CopyPlus, FolderDown } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/form";
import { buttonStyles, dialogStyles, inputStyles } from "@/components/styles";
import type { ExamKind } from "@/generated/prisma/enums";
import type { Problem } from "@/lib/paper/problems";
import { EXAM_KIND_LABEL } from "@/lib/templates/labels";
import { duplicatePaperAction } from "@/server/paper-actions";

type ExportState =
  | { step: "idle" | "working" }
  | { step: "confirm"; problems: Problem[] }
  | { step: "failed"; message: string; problems: Problem[] }
  | { step: "done"; folder: string };

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
}: {
  paperId: string;
  /** Waits for every question to reach the server; false when some could not be saved. */
  flush: () => Promise<boolean>;
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
      setState({
        step: "done",
        folder: decodeURIComponent(res.headers.get("X-DX-Folder") ?? ""),
      });
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

  const open = state.step === "confirm" || state.step === "failed" || state.step === "done";
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
                  <Dialog.Close className={buttonStyles.secondary}>Go back</Dialog.Close>
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
            ) : state.step === "done" ? (
              <>
                <Dialog.Title className="font-paper text-title font-semibold">
                  Exported
                </Dialog.Title>
                <Dialog.Description className="text-small text-ink-2">
                  The paper, its answer key and their LaTeX are in your data folder under{" "}
                  <span className="font-medium break-words text-ink">{state.folder}</span>, and a
                  zip of the same files is downloading. These are unreleased exam papers: keep them
                  out of shared and cloud-synced folders.
                </Dialog.Description>
                <div className="flex justify-end">
                  <Dialog.Close className={buttonStyles.primary}>Done</Dialog.Close>
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

export function DuplicateButton({
  paperId,
  title,
  examKind,
}: {
  paperId: string;
  title: string;
  examKind: ExamKind;
}) {
  const firstKind: ExamKind = examKind === "END_SEMESTER" ? "SUPPLEMENTARY_ATKT" : examKind;
  const suggested = (k: ExamKind) =>
    `${title} (${k === "SUPPLEMENTARY_ATKT" && examKind !== k ? "ATKT" : "copy"})`.slice(0, 200);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExamKind>(firstKind);
  const [name, setName] = useState(suggested(firstKind));
  const [nameTouched, setNameTouched] = useState(false);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = { title: useId(), kind: useId(), date: useId() };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setKind(firstKind);
          setName(suggested(firstKind));
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
          <CopyPlus size={15} aria-hidden /> Duplicate
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
                    examKind: kind,
                    examDate: date || null,
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
                Duplicate paper
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-small text-ink-2">
                The copy has every question and answer of this paper and opens as a draft. Use it
                for the ATKT (supplementary) version.
              </Dialog.Description>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.kind} className="text-small font-medium text-ink">
                Exam
              </label>
              <select
                id={ids.kind}
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as ExamKind;
                  setKind(k);
                  if (!nameTouched) setName(suggested(k));
                }}
                className={inputStyles}
              >
                {Object.entries(EXAM_KIND_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
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
