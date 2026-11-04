"use client";
import { useId, useState, useTransition } from "react";
import { Field, FormAlert } from "@/components/form";
import { buttonStyles } from "@/components/styles";
import {
  type NetworkResult,
  addFirewallRuleAction,
  removeFirewallRuleAction,
  saveNetworkAction,
} from "@/server/network-actions";

type Mode = "local" | "lan" | "server";

interface Settings {
  mode: Mode;
  port: string;
  hostNames: string;
  bindAddress: string;
  trustedProxies: string;
}

const MODES: { value: Mode; title: string; body: string }[] = [
  {
    value: "local",
    title: "This computer only",
    body: "Only the computer DRAFTEX runs on can open it. The safest choice.",
  },
  {
    value: "lan",
    title: "This network",
    body: "Colleagues on the same network open DRAFTEX in their browser. Pages and passwords cross the network unencrypted, so use this only on a network you trust, such as the staff network, never on public Wi-Fi.",
  },
  {
    value: "server",
    title: "Behind a secure web server",
    body: "For a server your IT staff run with HTTPS in front of DRAFTEX. DRAFTEX then answers only through that server.",
  },
];

const UNREACHABLE = "DRAFTEX is not reachable. Check that it is still running, then try again.";

async function call(fn: () => Promise<NetworkResult>): Promise<NetworkResult> {
  try {
    return await fn();
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, message: UNREACHABLE };
  }
}

export function NetworkForm({
  saved,
  onServerComputer,
}: {
  saved: Settings;
  onServerComputer: boolean;
}) {
  const name = useId();
  const [form, setForm] = useState<Settings>(saved);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<NetworkResult | null>(null);
  const set = (patch: Partial<Settings>) => {
    setForm((f) => ({ ...f, ...patch }));
    setResult(null);
  };
  const changed = (Object.keys(saved) as (keyof Settings)[]).some((k) => saved[k] !== form[k]);
  // Field errors sit next to their field; anything else next to Save.
  const failed = result && !result.ok ? result.message : null;
  const fieldError = (prefix: string) => (failed?.startsWith(prefix) ? failed : undefined);
  const formError =
    failed &&
    !["Port", "Address name", "Server mode", "Listen address", "Proxy address"].some((p) =>
      failed.startsWith(p),
    )
      ? failed
      : null;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await call(() => saveNetworkAction(form))));
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Who can open DRAFTEX</legend>
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors duration-150 ${
              form.mode === m.value
                ? "border-accent bg-accent-soft"
                : "border-rule bg-surface hover:border-rule-strong"
            } has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent`}
          >
            <input
              type="radio"
              name={name}
              value={m.value}
              checked={form.mode === m.value}
              onChange={() => set({ mode: m.value })}
              className="mt-1 size-4 shrink-0 accent-accent focus-visible:outline-none"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium text-ink">{m.title}</span>
              <span className="text-small text-ink-2">{m.body}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="max-w-sm">
        <Field
          label="Port"
          name="port"
          inputMode="numeric"
          className="max-w-32"
          value={form.port}
          onChange={(e) => set({ port: e.target.value })}
          error={fieldError("Port")}
          hint="Usually 3210."
        />
      </div>

      {form.mode === "server" ? (
        <div className="flex flex-col gap-4 rounded-lg border border-rule p-4">
          <Field
            label="Address people type"
            name="hostNames"
            placeholder="papers.college.edu"
            value={form.hostNames}
            onChange={(e) => set({ hostNames: e.target.value })}
            error={fieldError("Address name") ?? fieldError("Server mode")}
            hint="The name the secure web server answers to. Separate several with commas."
          />
          <Field
            label="Listen address"
            name="bindAddress"
            value={form.bindAddress}
            onChange={(e) => set({ bindAddress: e.target.value })}
            error={fieldError("Listen address")}
            hint="Where the secure web server reaches DRAFTEX. Keep 127.0.0.1 when it runs on this computer."
          />
          <Field
            label="Secure web server addresses"
            name="trustedProxies"
            value={form.trustedProxies}
            onChange={(e) => set({ trustedProxies: e.target.value })}
            error={fieldError("Proxy address")}
            hint="Only requests from these addresses are accepted."
          />
          <FormAlert kind="caution">
            After the restart DRAFTEX answers only through{" "}
            <span className="break-all">
              https://{form.hostNames.split(/[\s,]+/).filter(Boolean)[0] || "your address"}
            </span>
            . To undo this without that server, set “mode” back to “local” in config.json in the
            data folder.
          </FormAlert>
        </div>
      ) : null}

      {form.mode === "local" && !onServerComputer && saved.mode !== "local" ? (
        <FormAlert kind="caution">
          You are using DRAFTEX from another computer. After the restart only the DRAFTEX computer
          can open it.
        </FormAlert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonStyles.primary} disabled={pending || !changed}>
          {pending ? "Saving…" : "Save"}
        </button>
        {formError ? (
          <span role="alert" className="text-small text-danger">
            {formError}
          </span>
        ) : failed ? (
          <span role="alert" className="text-small text-danger">
            Not saved: check the field marked above.
          </span>
        ) : null}
        {result?.ok ? (
          <span role="status" className="text-small text-ink-2">
            Saved. Restart DRAFTEX to switch.
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function FirewallControls({
  ruleExists,
  onServerComputer,
  port,
}: {
  ruleExists: boolean;
  onServerComputer: boolean;
  port: number;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<NetworkResult | null>(null);
  const act = (fn: () => Promise<NetworkResult>) => start(async () => setResult(await call(fn)));

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-prose text-small text-ink-2">
        {ruleExists
          ? `Windows Firewall lets computers on this network reach DRAFTEX (port ${port}, private networks only).`
          : "Windows Firewall blocks other computers until you allow them. Windows asks for permission first."}
      </p>
      {onServerComputer ? (
        <div className="flex flex-wrap items-center gap-3">
          {ruleExists ? (
            <button
              type="button"
              className={buttonStyles.secondary}
              disabled={pending}
              onClick={() => act(removeFirewallRuleAction)}
            >
              {pending ? "Waiting for Windows…" : "Stop allowing"}
            </button>
          ) : (
            <button
              type="button"
              className={buttonStyles.secondary}
              disabled={pending}
              onClick={() => act(addFirewallRuleAction)}
            >
              {pending ? "Waiting for Windows…" : "Allow other computers"}
            </button>
          )}
          {result && !result.ok ? (
            <span role="alert" className="text-small text-danger">
              {result.message}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-small text-ink-2">
          Do this on the DRAFTEX computer itself: Windows asks for permission on its screen.
        </p>
      )}
    </div>
  );
}
