"use client";
// Paper status and versions in the editor (D55-D58): "Mark as Final", the
// read-only banner of a Final or Printed paper with its "Edit" confirmation,
// and the list of kept versions (open as PDF, restore as a new paper).
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, History, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/form";
import { buttonStyles, dialogStyles, inputStyles, linkStyles } from "@/components/styles";
import { restoreVersionAction, setPaperStatusAction } from "@/server/paper-actions";
import type { PaperEditorView } from "@/server/paper-view";

const UNREACHABLE = "DRAFTEX is not reachable. Check that it is still running, then try again.";

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

/** Draft papers: marks the paper Final after every question has reached the server. */
export function MarkFinalButton({
  view,
  flush,
  onError,
}: {
  view: PaperEditorView;
  flush: () => Promise<boolean>;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={buttonStyles.quiet}
      disabled={pending}
      title="Mark the paper Final. It becomes read-only and this version is kept."
      onClick={() =>
        start(async () => {
          onError(null);
          if (!(await flush())) {
            onError("Some questions are not saved yet. Fix the ones marked “Not saved” first.");
            return;
          }
          try {
            const r = await setPaperStatusAction(view.id, view.version, "FINAL");
            if (!r.ok) return onError(r.message);
            router.refresh();
          } catch {
            onError(UNREACHABLE);
          }
        })
      }
    >
      <CheckCircle2 size={15} aria-hidden /> {pending ? "Marking…" : "Mark as Final"}
    </button>
  );
}

/** Final and Printed papers (D56): read-only until "Edit" puts them back to Draft. */
export function LockedBanner({ view }: { view: PaperEditorView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const printed = view.status === "PRINTED";
  const what = printed
    ? `Printed${view.printedAt ? ` on ${dateOnly.format(new Date(view.printedAt))}` : ""}`
    : "Final";
  return (
    <div className="px-4 pt-3">
      <div
        role="note"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border-l-2 border-accent bg-accent-soft px-3 py-2 text-small text-ink"
      >
        <Lock size={15} aria-hidden className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">This paper is {what}.</span> It is read-only, so it stays
          the paper you {printed ? "printed" : "finished"}.
        </span>
        <Dialog.Root
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            setError(null);
          }}
        >
          <Dialog.Trigger asChild>
            <button type="button" className={buttonStyles.secondary + " h-8 px-3 text-small"}>
              Edit
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="dx-overlay fixed inset-0 z-50 bg-scrim" />
            <Dialog.Content
              className={`${dialogStyles} flex flex-col gap-4`}
              onOpenAutoFocus={(e) => {
                // The safe choice has the focus.
                e.preventDefault();
                (e.currentTarget as HTMLElement)
                  .querySelector<HTMLElement>("[data-cancel]")
                  ?.focus();
              }}
            >
              <div>
                <Dialog.Title className="font-paper text-title font-semibold">
                  Edit this {printed ? "printed" : "final"} paper?
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-small text-ink-2">
                  It goes back to Draft. The version kept when it was{" "}
                  {printed ? "exported" : "marked Final"} stays under Versions, where you can open
                  it as a PDF or restore it.
                </Dialog.Description>
              </div>
              {error ? <FormAlert kind="error">{error}</FormAlert> : null}
              <div className="flex justify-end gap-2">
                <Dialog.Close data-cancel className={buttonStyles.secondary}>
                  Cancel
                </Dialog.Close>
                <button
                  type="button"
                  className={buttonStyles.primary}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        const r = await setPaperStatusAction(view.id, view.version, "DRAFT");
                        if (!r.ok) return setError(r.message);
                        setOpen(false);
                        router.refresh();
                      } catch {
                        setError(UNREACHABLE);
                      }
                    })
                  }
                >
                  {pending ? "Opening…" : "Back to Draft and edit"}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}

const REASON = { FINAL: "Marked Final", EXPORT: "Exported" } as const;

/** The paper's kept versions (D57): open as PDF, or restore as a new Draft paper. */
export function VersionsButton({ view }: { view: PaperEditorView }) {
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleId = useId();
  const base = `/api/papers/${view.id}/versions`;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setRestoring(null);
        setError(null);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={buttonStyles.quiet}
          title="Versions kept when the paper was marked Final or exported"
        >
          <History size={15} aria-hidden /> Versions
          {view.versions.length ? (
            <span className="text-caption text-ink-3 tabular-nums">{view.versions.length}</span>
          ) : null}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content
          className={`${dialogStyles} flex flex-col gap-4 sm:w-[min(36rem,calc(100vw-2rem))]`}
        >
          <div>
            <Dialog.Title className="font-paper text-title font-semibold">Versions</Dialog.Title>
            <Dialog.Description className="mt-1 text-small text-ink-2">
              A version is kept each time the paper is marked Final or exported; the newest 20 stay.
              Opening one makes its PDF again, which takes a few seconds.
            </Dialog.Description>
          </div>
          {view.versions.length === 0 ? (
            <p className="rounded-md bg-sunk px-3 py-4 text-center text-small text-ink-2">
              No versions yet. Mark the paper Final or export it to keep one.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-rule rounded-md border border-rule">
              {view.versions.map((v) => {
                const when = dateTime.format(new Date(v.createdAt));
                return (
                  <li key={v.id} className="flex flex-col gap-2 px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-ink">{REASON[v.reason]}</span>{" "}
                        <span className="text-small text-ink-2">{when}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
                        <a
                          href={`${base}/${v.id}`}
                          target="_blank"
                          rel="noopener"
                          className={linkStyles}
                          aria-label={`Open the paper of the version from ${when} as PDF`}
                        >
                          Paper PDF
                        </a>
                        <a
                          href={`${base}/${v.id}?kind=key`}
                          target="_blank"
                          rel="noopener"
                          className={linkStyles}
                          aria-label={`Open the answer key of the version from ${when} as PDF`}
                        >
                          Key PDF
                        </a>
                        <button
                          type="button"
                          className={linkStyles}
                          aria-expanded={restoring === v.id}
                          onClick={() => {
                            setError(null);
                            setRestoring(restoring === v.id ? null : v.id);
                            setName(
                              `${view.title} (version of ${dateOnly.format(new Date(v.createdAt))})`.slice(
                                0,
                                200,
                              ),
                            );
                          }}
                        >
                          Restore…
                        </button>
                      </span>
                    </div>
                    {restoring === v.id ? (
                      <form
                        className="flex flex-col gap-2 rounded-md bg-sunk p-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (name.trim() === "") return setError("Give the copy a title.");
                          start(async () => {
                            setError(null);
                            try {
                              const r = await restoreVersionAction(view.id, v.id, name.trim());
                              if (r && !r.ok) setError(r.message);
                            } catch (err) {
                              // redirect() arrives as a thrown navigation; let it through.
                              if (err && typeof err === "object" && "digest" in err) throw err;
                              setError(UNREACHABLE);
                            }
                          });
                        }}
                      >
                        <p className="text-small text-ink-2">
                          The version becomes a new Draft paper with no exam date. This paper stays
                          as it is.
                        </p>
                        <label htmlFor={titleId} className="text-small font-medium text-ink">
                          Title of the new paper
                        </label>
                        <input
                          id={titleId}
                          value={name}
                          maxLength={200}
                          onChange={(e) => setName(e.target.value)}
                          className={inputStyles}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className={buttonStyles.secondary + " h-8 px-3 text-small"}
                            onClick={() => setRestoring(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className={buttonStyles.primary + " h-8 px-3 text-small"}
                            disabled={pending}
                          >
                            {pending ? "Restoring…" : "Restore as new paper"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {error ? <FormAlert kind="error">{error}</FormAlert> : null}
          <div className="flex justify-end">
            <Dialog.Close className={buttonStyles.secondary}>Close</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
