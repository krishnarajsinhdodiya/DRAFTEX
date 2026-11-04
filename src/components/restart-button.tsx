"use client";
// "Restart DRAFTEX" (D37): asks the server to restart, waits until it is
// gone and back, then reloads. When the restart moves DRAFTEX to another
// address, it shows that address instead of waiting here.
import { useState, useTransition } from "react";
import { restartAction } from "@/server/network-actions";
import { FormAlert } from "./form";
import { buttonStyles, linkStyles } from "./styles";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function up(): Promise<boolean> {
  try {
    return (await fetch("/login", { cache: "no-store", redirect: "manual" })).status < 500;
  } catch {
    return false;
  }
}

/** Waits for the old server to stop (or 4 s), then for the new one to answer (up to 2 min). */
async function waitForRestart(): Promise<boolean> {
  for (let i = 0; i < 8 && (await up()); i++) await sleep(500);
  for (let i = 0; i < 120; i++) {
    if (await up()) return true;
    await sleep(1000);
  }
  return false;
}

export function RestartButton({
  nextAddress,
  label = "Restart DRAFTEX",
  variant = "secondary",
}: {
  /** Where DRAFTEX answers after the restart, when that differs from this page's address. */
  nextAddress?: string | null;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<
    { step: "idle" } | { step: "waiting" } | { step: "moved" } | { step: "error"; text: string }
  >({ step: "idle" });

  const restart = () =>
    start(async () => {
      try {
        const r = await restartAction();
        if (!r.ok) return setState({ step: "error", text: r.message });
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        return setState({ step: "error", text: "DRAFTEX is not reachable. Is it still running?" });
      }
      if (nextAddress) return setState({ step: "moved" });
      setState({ step: "waiting" });
      if (await waitForRestart()) window.location.reload();
      else
        setState({
          step: "error",
          text: "DRAFTEX has not come back after 2 minutes. Look at its window for a message.",
        });
    });

  if (state.step === "moved" && nextAddress) {
    return (
      <FormAlert kind="notice">
        DRAFTEX is restarting. In a few seconds, open it at{" "}
        <a className={linkStyles} href={nextAddress}>
          {nextAddress}
        </a>
        .
      </FormAlert>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={buttonStyles[variant]}
        disabled={pending || state.step === "waiting"}
        onClick={restart}
      >
        {state.step === "waiting" ? "Restarting…" : label}
      </button>
      {state.step === "waiting" ? (
        <span role="status" className="text-small text-ink-2">
          This page reloads when DRAFTEX is back.
        </span>
      ) : null}
      {state.step === "error" ? (
        <span role="alert" className="text-small text-danger">
          {state.text}
        </span>
      ) : null}
    </div>
  );
}
