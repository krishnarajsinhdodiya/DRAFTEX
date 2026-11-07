"use client";
// Upload → preview (row by row) → save the valid rows (D80). The browser
// keeps the file and sends it again for each step; the server keeps nothing.
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { FormAlert } from "@/components/form";
import { buttonStyles, sheetStyles } from "@/components/styles";
import type { ImportPreview, RowStatus } from "@/server/bank-import";

const UNREACHABLE = "DRAFTEX is not reachable. Check that it is still running, then try again.";
const STATUS: Record<RowStatus, { label: string; tone: "green" | "amber" | "neutral" }> = {
  valid: { label: "Ready", tone: "green" },
  invalid: { label: "Problem", tone: "amber" },
  duplicate: { label: "Duplicate", tone: "neutral" },
};

async function send(file: File, step: "preview" | "save" | "report"): Promise<Response> {
  return fetch(`/api/bank/import?step=${step}`, {
    method: "POST",
    headers: { "Content-Type": "text/csv" },
    body: file,
  });
}

async function message(res: Response): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { message?: string };
  return j.message ?? "The file could not be read.";
}

export function ImportClient() {
  const router = useRouter();
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<"all" | "problems">("all");
  const [pending, start] = useTransition();

  const check = (f: File) =>
    start(async () => {
      setError(null);
      setPreview(null);
      setSaved(null);
      try {
        const res = await send(f, "preview");
        if (!res.ok) return setError(await message(res));
        setPreview((await res.json()) as ImportPreview);
      } catch {
        setError(UNREACHABLE);
      }
    });

  const save = () =>
    file &&
    start(async () => {
      setError(null);
      try {
        const res = await send(file, "save");
        if (!res.ok) return setError(await message(res));
        const r = (await res.json()) as { saved: number; preview: ImportPreview };
        setSaved(r.saved);
        setPreview(r.preview);
        router.refresh();
      } catch {
        setError(UNREACHABLE);
      }
    });

  const report = () =>
    file &&
    start(async () => {
      try {
        const res = await send(file, "report");
        if (!res.ok) return setError(await message(res));
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = "draftex-import-problems.csv";
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        setError(UNREACHABLE);
      }
    });

  const rows = preview?.rows.filter((r) => show === "all" || r.status !== "valid") ?? [];
  const notSaved = preview ? preview.counts.invalid + preview.counts.duplicate : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setFile(f);
            check(f);
          }}
        />
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp size={16} aria-hidden /> {file ? "Choose another file" : "Choose a CSV file"}
        </button>
        {file ? (
          <span className="text-small text-ink-2 break-words [overflow-wrap:anywhere]">
            {file.name}
          </span>
        ) : null}
        {pending ? <span className="text-small text-ink-3">Working…</span> : null}
      </div>

      {error ? <FormAlert kind="error">{error}</FormAlert> : null}

      {preview ? (
        <>
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-ink-2"
          >
            <span>
              Read as <span className="font-medium text-ink">{preview.encoding}</span>
            </span>
            <span>{preview.counts.valid} ready</span>
            <span>{preview.counts.invalid} with problems</span>
            <span>
              {preview.counts.duplicate === 1
                ? "1 duplicate"
                : `${preview.counts.duplicate} duplicates`}
            </span>
          </div>
          {saved !== null ? (
            <FormAlert kind="notice">
              {saved === 1 ? "1 question was saved" : `${saved} questions were saved`} to your bank.
              {notSaved ? " The rows below were not saved." : ""}
            </FormAlert>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {saved === null ? (
              <button
                type="button"
                className={buttonStyles.primary}
                disabled={pending || preview.counts.valid === 0}
                onClick={save}
              >
                {preview.counts.valid === 1
                  ? "Save 1 question"
                  : `Save ${preview.counts.valid} questions`}
                {notSaved ? " (skip the rest)" : ""}
              </button>
            ) : null}
            {notSaved ? (
              <button
                type="button"
                className={buttonStyles.secondary}
                disabled={pending}
                onClick={report}
              >
                Download the problems as CSV
              </button>
            ) : null}
            {notSaved && preview.counts.valid ? (
              <label className="ml-auto flex items-center gap-2 text-small">
                Show
                <select
                  value={show}
                  onChange={(e) => setShow(e.target.value as "all" | "problems")}
                  className="h-8 rounded-md border border-rule-strong bg-surface px-2 text-small"
                >
                  <option value="all">Every row</option>
                  <option value="problems">Only rows not saved</option>
                </select>
              </label>
            ) : null}
          </div>
          <div className={`${sheetStyles} overflow-x-auto`}>
            {/* Three columns, the course inside the last one, so the reasons fit a phone (/break-ui). */}
            <table className="w-full table-fixed text-left text-small">
              <caption className="sr-only">Rows of the file and what happens to each</caption>
              <thead className="border-b border-rule text-caption text-ink-3 uppercase">
                <tr>
                  <th scope="col" className="w-12 px-3 py-2 font-semibold sm:w-14 sm:px-4">
                    Row
                  </th>
                  <th scope="col" className="w-24 px-2 py-2 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-2 py-2 font-semibold">
                    Course, question and notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((r) => (
                  <tr key={r.row} className="align-top">
                    <td className="px-3 py-2 tabular-nums sm:px-4">{r.row}</td>
                    <td className="px-2 py-2">
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </td>
                    <td className="px-2 py-2">
                      {r.courseCode ? (
                        <span className="block text-caption text-ink-3 break-words [overflow-wrap:anywhere]">
                          {r.courseCode}
                        </span>
                      ) : null}
                      <span className="block break-words [overflow-wrap:anywhere]">
                        {r.summary || <span className="text-ink-3">(empty)</span>}
                      </span>
                      {r.reasons.map((m) => (
                        <span key={m} className="mt-0.5 block text-danger">
                          {m}
                        </span>
                      ))}
                      {r.warnings.map((m) => (
                        <span key={m} className="mt-0.5 block text-caution">
                          {m}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
