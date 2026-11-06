"use client";
// Trash actions (D51): Undo after a delete, Restore, Delete forever, Empty Trash.
import * as Dialog from "@radix-ui/react-dialog";
import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/form";
import { buttonStyles, dialogStyles } from "@/components/styles";
import type { CommandResult } from "@/server/template-commands";
import { emptyTrashAction, purgePaperAction, restorePaperAction } from "@/server/paper-actions";
import {
  emptyQuestionTrashAction,
  purgeQuestionAction,
  restoreQuestionAction,
} from "@/server/bank-actions";

/** Papers (D51) and bank questions (D82) share the Trash. */
type Kind = "paper" | "question";

const UNREACHABLE = "DRAFTEX is not reachable. Check that it is still running, then try again.";

function useCommand(after: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<CommandResult<unknown>>) =>
    start(async () => {
      setError(null);
      try {
        const r = await fn();
        if (!r.ok) setError(r.message);
        else after();
      } catch {
        setError(UNREACHABLE);
      }
    });
  return { pending, error, run };
}

/** The notice the Papers list shows right after a paper went to Trash. */
export function TrashedNotice({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const { pending, error, run } = useCommand(() => router.replace("/papers"));
  return (
    <div className="flex flex-col gap-2">
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-md border border-rule bg-sunk px-4 py-3 text-small"
      >
        <span className="break-words">
          “{title}” was moved to Trash. You can restore it for 30 days.
        </span>
        <button
          type="button"
          className={buttonStyles.quiet}
          disabled={pending}
          onClick={() => run(() => restorePaperAction(id))}
        >
          <RotateCcw size={14} aria-hidden /> Undo
        </button>
      </div>
      {error ? <FormAlert kind="error">{error}</FormAlert> : null}
    </div>
  );
}

export function RestoreButton({
  id,
  title,
  kind = "paper",
}: {
  id: string;
  title: string;
  kind?: Kind;
}) {
  const router = useRouter();
  const { pending, error, run } = useCommand(() => router.refresh());
  return (
    <>
      <button
        type="button"
        className={buttonStyles.quiet}
        disabled={pending}
        aria-label={`Restore ${title}`}
        onClick={() =>
          run(() => (kind === "paper" ? restorePaperAction(id) : restoreQuestionAction(id)))
        }
      >
        <RotateCcw size={14} aria-hidden /> Restore
      </button>
      {error ? <FormAlert kind="error">{error}</FormAlert> : null}
    </>
  );
}

function Confirm({
  trigger,
  title,
  description,
  action,
  onConfirm,
  pending,
  error,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content className={`${dialogStyles} flex flex-col gap-4`}>
          <div>
            <Dialog.Title className="font-paper text-title font-semibold break-words">
              {title}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-small text-ink-2">
              {description}
            </Dialog.Description>
          </div>
          {error ? <FormAlert kind="error">{error}</FormAlert> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close className={buttonStyles.secondary}>Cancel</Dialog.Close>
            <button
              type="button"
              disabled={pending}
              className={`${buttonStyles.primary} bg-danger hover:opacity-90`}
              onClick={onConfirm}
            >
              {action}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const FOREVER =
  "It cannot be restored afterwards, except from a backup made while it still existed.";

export function PurgeButton({
  id,
  title,
  kind = "paper",
}: {
  id: string;
  title: string;
  kind?: Kind;
}) {
  const router = useRouter();
  const { pending, error, run } = useCommand(() => router.refresh());
  return (
    <Confirm
      trigger={
        <button
          type="button"
          className={buttonStyles.danger}
          aria-label={`Delete ${title} forever`}
        >
          <Trash2 size={14} aria-hidden /> Delete forever
        </button>
      }
      title={`Delete “${title}” forever?`}
      description={
        kind === "paper"
          ? `The paper, its questions and its answer key are deleted. ${FOREVER}`
          : `The question and its model answer are deleted from the bank. Papers that use it keep their own copy. ${FOREVER}`
      }
      action="Delete forever"
      onConfirm={() =>
        run(() => (kind === "paper" ? purgePaperAction(id) : purgeQuestionAction(id)))
      }
      pending={pending}
      error={error}
    />
  );
}

export function EmptyTrashButton({ papers, questions }: { papers: number; questions: number }) {
  const what = [
    papers ? (papers === 1 ? "1 paper" : `${papers} papers`) : null,
    questions ? (questions === 1 ? "1 bank question" : `${questions} bank questions`) : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const router = useRouter();
  const { pending, error, run } = useCommand(() => router.refresh());
  return (
    <Confirm
      trigger={
        <button type="button" className={buttonStyles.danger}>
          <Trash2 size={14} aria-hidden /> Empty Trash
        </button>
      }
      title={`Delete ${what} forever?`}
      description={`Everything in Trash is deleted, papers with their questions and answer keys. ${FOREVER}`}
      action="Empty Trash"
      onConfirm={() =>
        run(async () => {
          const a = await emptyTrashAction();
          if (!a.ok) return a;
          return emptyQuestionTrashAction();
        })
      }
      pending={pending}
      error={error}
    />
  );
}
