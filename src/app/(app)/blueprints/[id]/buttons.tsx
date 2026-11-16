"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonStyles } from "@/components/styles";
import { deleteBlueprintAction, setBlueprintSharingAction } from "@/server/blueprint-actions";

export function ShareSwitch({ id, shared }: { id: string; shared: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Ticks at once; goes back if the save fails (it waited for a refresh before).
  const [on, setOn] = useState(shared);
  return (
    <span className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-small text-ink">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            start(async () => {
              setError(null);
              const r = await setBlueprintSharingAction(id, next);
              if (r.ok) router.refresh();
              else {
                setOn(!next);
                setError(r.message);
              }
            });
          }}
        />
        Share with colleagues (they can see and use it, not change it)
      </label>
      {error ? <span className="text-small text-danger">{error}</span> : null}
    </span>
  );
}

export function DeleteBlueprint({ id }: { id: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!asking) {
    return (
      <button type="button" className={buttonStyles.danger} onClick={() => setAsking(true)}>
        <Trash2 size={16} aria-hidden /> Delete blueprint
      </button>
    );
  }
  return (
    <span
      role="group"
      aria-label="Confirm delete"
      className="flex flex-wrap items-center gap-2 text-small"
    >
      <span>Delete this blueprint? Papers are not changed.</span>
      <button
        type="button"
        autoFocus
        className={buttonStyles.quiet}
        onClick={() => setAsking(false)}
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={pending}
        className={buttonStyles.danger}
        onClick={() =>
          start(async () => {
            const r = await deleteBlueprintAction(id);
            if (r.ok) router.push("/blueprints");
            else setError(r.message);
          })
        }
      >
        Delete
      </button>
      {error ? <span className="text-danger">{error}</span> : null}
    </span>
  );
}
