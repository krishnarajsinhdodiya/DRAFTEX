"use client";
// Moves the paper to Trash (D51) after one confirmation; Trash can restore it for 30 days.
import * as Dialog from "@radix-ui/react-dialog";
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/form";
import { buttonStyles, dialogStyles } from "@/components/styles";
import { deletePaperAction } from "@/server/paper-actions";

export function DeletePaperButton({
  paperId,
  title,
  flush,
}: {
  paperId: string;
  title: string;
  flush: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog.Root onOpenChange={(o) => o && setError(null)}>
      <Dialog.Trigger asChild>
        <button type="button" className={buttonStyles.quiet} title="Move this paper to Trash">
          <Trash2 size={15} aria-hidden /> <span className="max-sm:sr-only">Delete</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content className={`${dialogStyles} flex flex-col gap-4`}>
          <div>
            <Dialog.Title className="font-paper text-title font-semibold break-words">
              Move “{title}” to Trash?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-small text-ink-2">
              You can restore it from Trash on the Papers page for 30 days; after that it is deleted
              for good. Files you already exported stay in the exports folder.
            </Dialog.Description>
          </div>
          {error ? <FormAlert kind="error">{error}</FormAlert> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close className={buttonStyles.secondary}>Cancel</Dialog.Close>
            <button
              type="button"
              disabled={pending}
              className={`${buttonStyles.primary} bg-danger hover:opacity-90`}
              onClick={() =>
                start(async () => {
                  setError(null);
                  try {
                    await flush();
                    const r = await deletePaperAction(paperId);
                    if (r && !r.ok) setError(r.message);
                  } catch {
                    setError(
                      "DRAFTEX is not reachable. Check that it is still running, then try again.",
                    );
                  }
                })
              }
            >
              Move to Trash
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
