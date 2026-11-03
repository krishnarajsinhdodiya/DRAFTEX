"use client";
// Template action buttons. Each calls a server action and shows its message.
import * as Dialog from "@radix-ui/react-dialog";
import { Copy, Globe, Lock, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { FormAlert, buttonStyles } from "@/components/form";
import type { CommandResult } from "@/server/template-commands";
import {
  copyTemplateAction,
  deleteTemplateAction,
  setTemplateVisibilityAction,
} from "@/server/template-actions";

function useCommand() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<CommandResult<unknown> | undefined>) =>
    start(async () => {
      setError(null);
      try {
        const r = await fn();
        if (r && !r.ok) setError(r.message);
      } catch {
        setError("DRAFTEX is not reachable. Check that it is still running, then try again.");
      }
    });
  return { pending, error, run };
}

function Failure({ error }: { error: string | null }) {
  return error ? (
    <div className="basis-full">
      <FormAlert kind="error">{error}</FormAlert>
    </div>
  ) : null;
}

export function NewTemplateButton({ blankId }: { blankId: string }) {
  const { pending, error, run } = useCommand();
  return (
    <>
      <button
        type="button"
        className={buttonStyles.primary}
        disabled={pending}
        onClick={() => run(() => copyTemplateAction(blankId, "Untitled template"))}
      >
        <Plus aria-hidden size={16} />
        {pending ? "Creating…" : "New template"}
      </button>
      <Failure error={error} />
    </>
  );
}

export function TemplateActions({
  id,
  title,
  access,
  visibility,
  editHref,
}: {
  id: string;
  title: string;
  access: { edit: boolean; copy: boolean; publish: boolean; unpublish: boolean; remove: boolean };
  visibility: "PRIVATE" | "GLOBAL";
  editHref: string;
}) {
  const { pending, error, run } = useCommand();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {access.edit ? (
        <a href={editHref} className={buttonStyles.primary}>
          Edit
        </a>
      ) : null}
      {access.copy ? (
        <button
          type="button"
          className={access.edit ? buttonStyles.secondary : buttonStyles.primary}
          disabled={pending}
          onClick={() => run(() => copyTemplateAction(id))}
        >
          <Copy aria-hidden size={16} />
          Make a copy
        </button>
      ) : null}
      {access.publish ? (
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={pending}
          onClick={() => run(() => setTemplateVisibilityAction(id, "GLOBAL"))}
        >
          <Globe aria-hidden size={16} />
          Make global
        </button>
      ) : null}
      {access.unpublish && visibility === "GLOBAL" ? (
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={pending}
          onClick={() => run(() => setTemplateVisibilityAction(id, "PRIVATE"))}
        >
          <Lock aria-hidden size={16} />
          Make private
        </button>
      ) : null}
      {access.remove ? (
        <ConfirmDelete title={title} onConfirm={() => run(() => deleteTemplateAction(id))}>
          <button
            type="button"
            className={`${buttonStyles.secondary} text-red-700 dark:text-red-400`}
          >
            <Trash2 aria-hidden size={16} />
            Delete
          </button>
        </ConfirmDelete>
      ) : null}
      <Failure error={error} />
    </div>
  );
}

function ConfirmDelete({
  title,
  onConfirm,
  children,
}: {
  title: string;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 bg-black/30" />
        <Dialog.Content className="dx-dialog fixed top-1/2 left-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl ring-1 ring-black/10 dark:bg-neutral-900 dark:ring-white/10">
          <Dialog.Title className="text-lg font-semibold break-words">
            Delete “{title}”?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
            It disappears from the library. Papers already made from it keep their own copy and are
            not changed.
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className={buttonStyles.secondary}>Cancel</Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              className={`${buttonStyles.primary} bg-red-700 hover:bg-red-800 dark:bg-red-700 dark:hover:bg-red-600`}
            >
              Delete template
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
