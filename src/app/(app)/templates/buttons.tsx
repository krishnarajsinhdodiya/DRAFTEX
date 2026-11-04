"use client";
// Template action buttons. Each calls a server action and shows its message.
import * as Dialog from "@radix-ui/react-dialog";
import { Copy, Globe, Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { FormAlert, buttonStyles } from "@/components/form";
import type { CommandResult } from "@/server/template-commands";
import {
  copyTemplateAction,
  deleteTemplateAction,
  restoreBuiltInsAction,
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

/** Asks for the title first, so no "Untitled template" is left behind. */
export function NewTemplateButton({ blankId }: { blankId: string }) {
  const { pending, error, run } = useCommand();
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  const missing = title.trim() === "";
  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) return;
        setTitle("");
        setTouched(false);
      }}
    >
      <Dialog.Trigger asChild>
        <button type="button" className={buttonStyles.primary}>
          <Plus aria-hidden size={16} />
          New template
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 bg-scrim" />
        <Dialog.Content className={dialogClass}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (!missing) run(() => copyTemplateAction(blankId, title.trim()));
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <Dialog.Title className="font-paper text-title font-semibold">
                New template
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-small text-ink-2">
                It starts as one group of questions with a plain header; you build it from there. To
                start from a PCI or KSV pattern instead, open that template and make a copy.
              </Dialog.Description>
            </div>
            <label className="flex flex-col gap-1.5 text-small font-medium">
              Title
              <input
                autoFocus
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Pharmacology sessional, 2 credits"
                aria-invalid={touched && missing ? true : undefined}
                aria-describedby={touched && missing ? "new-title-error" : undefined}
                className={inputClass}
              />
              {touched && missing ? (
                <span id="new-title-error" className="font-normal text-danger">
                  Give the template a title.
                </span>
              ) : null}
            </label>
            <Failure error={error} />
            <div className="flex justify-end gap-2">
              <Dialog.Close className={buttonStyles.secondary}>Cancel</Dialog.Close>
              <button type="submit" className={buttonStyles.primary} disabled={pending}>
                {pending ? "Creating…" : "Create template"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const dialogClass =
  "dx-dialog fixed top-1/2 left-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 " +
  "rounded-xl bg-surface p-6 shadow-xl ring-1 ring-rule";

const inputClass =
  "block h-10 w-full rounded-md border border-rule-strong bg-surface px-3 text-body font-normal text-ink " +
  "placeholder:text-ink-3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 " +
  "focus-visible:outline-accent aria-invalid:border-danger";

export function TemplateActions({
  id,
  title,
  access,
  visibility,
  editHref,
  builtIn = false,
}: {
  id: string;
  title: string;
  access: { edit: boolean; copy: boolean; publish: boolean; unpublish: boolean; remove: boolean };
  visibility: "PRIVATE" | "GLOBAL";
  editHref: string;
  builtIn?: boolean;
}) {
  const { pending, error, run } = useCommand();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {access.edit ? (
        <a href={editHref} className={buttonStyles.secondary}>
          Edit
        </a>
      ) : null}
      {access.copy ? (
        <button
          type="button"
          className={buttonStyles.secondary}
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
        <ConfirmDelete
          title={title}
          builtIn={builtIn}
          onConfirm={() => run(() => deleteTemplateAction(id))}
        >
          <button type="button" className={`${buttonStyles.secondary} text-danger`}>
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
  builtIn,
  onConfirm,
  children,
}: {
  title: string;
  builtIn: boolean;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 bg-scrim" />
        <Dialog.Content className={dialogClass}>
          <Dialog.Title className="font-paper text-title font-semibold break-words">
            Delete “{title}”?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-small text-ink-2">
            {builtIn
              ? "It disappears from the library for everyone. Papers already made from it keep their own copy and are not changed. “Restore built-in templates” on the Templates page brings it back."
              : "It disappears from the library. Papers already made from it keep their own copy and are not changed."}
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className={buttonStyles.secondary}>Cancel</Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              className={`${buttonStyles.primary} bg-danger hover:opacity-90`}
            >
              Delete template
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Administrators only: shown while some built-in templates are deleted (D50). */
export function RestoreBuiltInsButton({ count }: { count: number }) {
  const { pending, error, run } = useCommand();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-rule bg-sunk px-4 py-3 text-small">
      <span className="text-ink-2">
        {count === 1
          ? "1 built-in template is deleted."
          : `${count} built-in templates are deleted.`}
      </span>
      <button
        type="button"
        className={buttonStyles.quiet}
        disabled={pending}
        onClick={() => run(() => restoreBuiltInsAction())}
      >
        <RotateCcw aria-hidden size={14} />
        Restore built-in templates
      </button>
      <Failure error={error} />
    </div>
  );
}
