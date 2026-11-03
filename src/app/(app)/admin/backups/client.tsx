"use client";
import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/form";
import { buttonStyles, inputStyles } from "@/components/styles";
import { backupNowAction, cancelRestoreAction } from "@/server/backup-actions";

const UNREACHABLE = "DRAFTEX is not reachable. Check that it is still running, then try again.";

export function BackupNowButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: "notice" | "error"; text: string } | null>(null);
  return (
    <div className="flex items-center gap-3">
      {message ? (
        <span
          role="status"
          className={`text-small ${message.kind === "error" ? "text-danger" : "text-ink-2"}`}
        >
          {message.text}
        </span>
      ) : null}
      <button
        type="button"
        className={buttonStyles.primary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await backupNowAction();
              setMessage(
                r.ok
                  ? { kind: "notice", text: "Backup saved." }
                  : { kind: "error", text: r.message },
              );
            } catch (e) {
              if (e && typeof e === "object" && "digest" in e) throw e;
              setMessage({ kind: "error", text: UNREACHABLE });
            }
          })
        }
      >
        {pending ? "Backing up…" : "Back up now"}
      </button>
    </div>
  );
}

export function CancelRestoreButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={buttonStyles.secondary}
      disabled={pending}
      onClick={() => start(() => cancelRestoreAction())}
    >
      Cancel the restore
    </button>
  );
}

interface Staged {
  createdAt: string;
  appVersion: string;
  users: number;
  papers: number;
  pictures: number;
}

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

export function RestoreForm({ disabled }: { disabled: boolean }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<Staged | null>(null);

  const send = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/restore", {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      const body = (await res.json().catch(() => ({}))) as Partial<Staged> & { message?: string };
      if (!res.ok) {
        setError(body.message ?? "The backup could not be checked.");
        return;
      }
      setStaged(body as Staged);
      setConfirming(false);
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  };

  if (staged) {
    return (
      <FormAlert kind="notice">
        The backup made {new Date(staged.createdAt).toLocaleString()} (
        {n(staged.users, "person", "people")}, {n(staged.papers, "paper", "papers")},{" "}
        {n(staged.pictures, "picture", "pictures")}) is checked and ready. Stop DRAFTEX and start it
        again to finish the restore.
      </FormAlert>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return setError("Choose a backup file first.");
        setConfirming(true);
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={id} className="sr-only">
          Backup file
        </label>
        <input
          id={id}
          type="file"
          accept=".zip,application/zip"
          disabled={disabled || busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setConfirming(false);
            setError(null);
          }}
          className={`${inputStyles} h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-sunk file:px-2 file:py-1 file:text-small`}
        />
        {!confirming ? (
          <button
            type="submit"
            className={buttonStyles.secondary}
            disabled={disabled || busy || !file}
          >
            Restore this backup…
          </button>
        ) : null}
      </div>
      {confirming ? (
        <div
          role="alertdialog"
          aria-labelledby={`${id}-q`}
          className="flex flex-wrap items-center gap-3 rounded-md border-l-4 border-danger bg-danger-soft px-4 py-3"
        >
          <p id={`${id}-q`} className="min-w-0 flex-1 text-small">
            Replace everything in DRAFTEX with{" "}
            <span className="font-semibold break-all">{file?.name}</span>? What is there now is
            backed up first.
          </p>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Keep my data
          </button>
          <button
            type="button"
            className={`${buttonStyles.secondary} border-danger text-danger hover:bg-danger-soft`}
            onClick={() => void send()}
            disabled={busy}
          >
            {busy ? "Checking…" : "Check and restore"}
          </button>
        </div>
      ) : null}
      {error ? <FormAlert kind="error">{error}</FormAlert> : null}
    </form>
  );
}
