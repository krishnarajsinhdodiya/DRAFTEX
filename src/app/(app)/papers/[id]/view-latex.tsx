"use client";
// "View LaTeX" (D104): the LaTeX DRAFTEX writes for the saved paper or one
// question, read-only, with a copy button. Changes are made in the editor;
// this always follows them.
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonStyles, dialogStyles } from "@/components/styles";

export interface LatexTarget {
  /** "g2.3"; absent for the whole paper. */
  slotId?: string;
  /** "Q.2(3)", or "the paper". */
  name: string;
}

type Kind = "paper" | "key";
type Loaded =
  { state: "loading" } | { state: "ok"; tex: string } | { state: "error"; message: string };

async function load(paperId: string, kind: Kind, slotId?: string): Promise<Loaded> {
  const q = new URLSearchParams();
  if (kind === "key") q.set("kind", "key");
  if (slotId) q.set("slot", slotId);
  try {
    const res = await fetch(`/api/papers/${paperId}/latex?${q}`, { cache: "no-store" });
    if (res.ok) return { state: "ok", tex: await res.text() };
    const body = (await res.json().catch(() => null)) as {
      message?: string;
      problems?: { message: string }[];
    } | null;
    const first = body?.problems?.[0]?.message;
    return {
      state: "error",
      message: [body?.message ?? "The LaTeX could not be shown.", first].filter(Boolean).join(" "),
    };
  } catch {
    return { state: "error", message: "DRAFTEX did not answer. Check that it is still running." };
  }
}

export function LatexDialog({
  paperId,
  target,
  onClose,
}: {
  paperId: string;
  target: LatexTarget | null;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>("paper");
  // The answer for one request (target and kind); anything else is still loading.
  const [result, setResult] = useState<{ for: LatexTarget; kind: Kind; r: Loaded } | null>(null);
  const [copied, setCopied] = useState(false);
  const slotId = target?.slotId;
  const loaded: Loaded =
    result && result.for === target && result.kind === kind ? result.r : { state: "loading" };

  useEffect(() => {
    if (!target) return;
    let live = true;
    void load(paperId, kind, target.slotId).then((r) => {
      if (live) setResult({ for: target, kind, r });
    });
    return () => {
      live = false;
    };
  }, [target, paperId, kind]);

  const copy = async () => {
    if (loaded.state !== "ok") return;
    try {
      await navigator.clipboard.writeText(loaded.tex);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog.Root
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          setKind("paper");
          setCopied(false);
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dx-overlay fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content
          className={`${dialogStyles} flex flex-col gap-4 sm:w-[min(48rem,calc(100vw-2rem))]`}
        >
          <div>
            <Dialog.Title className="font-paper text-title font-semibold wrap-anywhere">
              LaTeX of {target?.name ?? "the paper"}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-small text-ink-2">
              What DRAFTEX sends to LaTeX for the saved {slotId ? "question" : "paper"}. It is
              read-only: change the question in the editor and this follows.
            </Dialog.Description>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Show" className="flex rounded-md bg-sunk p-0.5">
              {(["paper", "key"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => {
                    setKind(k);
                    setCopied(false);
                  }}
                  className="rounded px-2.5 py-1 text-small text-ink-2 aria-checked:bg-surface aria-checked:font-medium aria-checked:text-ink aria-checked:shadow-sheet focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {k === "paper" ? "Paper" : "Answer key"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`${buttonStyles.secondary} ml-auto`}
              disabled={loaded.state !== "ok"}
              onClick={() => void copy()}
            >
              {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <span role="status" className="sr-only">
            {loaded.state === "loading" ? "Loading the LaTeX" : copied ? "Copied" : ""}
          </span>
          {loaded.state === "error" ? (
            <p className="rounded-md bg-sunk px-3 py-4 text-small text-ink-2">{loaded.message}</p>
          ) : (
            <pre
              tabIndex={0}
              aria-label={`LaTeX of ${target?.name ?? "the paper"}`}
              aria-busy={loaded.state === "loading"}
              className="max-h-[min(32rem,60dvh)] min-h-24 overflow-auto rounded-md border border-rule bg-sunk/60 p-3 font-mono text-caption leading-5 whitespace-pre text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              {loaded.state === "ok" ? loaded.tex : " "}
            </pre>
          )}
          <div className="flex justify-end">
            <Dialog.Close className={buttonStyles.secondary}>Close</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
