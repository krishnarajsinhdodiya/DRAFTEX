"use client";
import { Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonStyles } from "@/components/styles";
import { copyQuestionAction, trashQuestionAction } from "@/server/bank-actions";

/** "Copy to my bank" (D74): a private copy the colleague owns. */
export function CopyButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        className={buttonStyles.secondary}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await copyQuestionAction(id);
            if (r.ok) router.push(`/bank/${r.value}`);
            else setError(r.message);
          })
        }
      >
        <Copy size={16} aria-hidden /> {pending ? "Copying…" : "Copy to my bank"}
      </button>
      {error ? (
        <span role="alert" className="text-small text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Moves the question to Trash (D82); it can be restored there for 30 days. */
export function TrashQuestionButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        className={buttonStyles.danger}
        onClick={() =>
          start(async () => {
            const r = await trashQuestionAction(id);
            if (r.ok) router.push("/bank");
            else setError(r.message);
          })
        }
      >
        <Trash2 size={15} aria-hidden /> Move to Trash
      </button>
      {error ? (
        <span role="alert" className="text-small text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
