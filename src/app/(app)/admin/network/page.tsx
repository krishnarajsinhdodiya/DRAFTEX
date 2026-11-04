import type { Metadata } from "next";
import { headers } from "next/headers";
import { FormAlert } from "@/components/form";
import { RestartButton } from "@/components/restart-button";
import { eyebrowStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { clientAddress, requireAdmin } from "@/server/auth";
import { networkDeps } from "@/server/network";
import { networkCommands } from "@/server/network-commands";
import { FirewallControls, NetworkForm } from "./client";

export const metadata: Metadata = { title: "Network · DRAFTEX" };

const MODE_LABEL = {
  local: "This computer only",
  lan: "This network",
  server: "Behind a secure web server",
} as const;

export default async function NetworkPage() {
  const { user } = await requireAdmin();
  const view = await networkCommands(
    await getData(),
    networkDeps(),
    actorOf(user),
    await clientAddress(),
  ).view();
  const host = ((await headers()).get("host") ?? "127.0.0.1").replace(/:\d+$/, "");

  // Where this admin will find DRAFTEX after a restart, when it is not this page's address.
  const { saved, running } = view;
  let nextAddress: string | null = null;
  if (saved.mode === "server") nextAddress = `https://${saved.hostNames[0]}`;
  else if (saved.mode === "local" && !view.onServerComputer) nextAddress = null;
  else if (running.mode === "server" || saved.port !== running.port) {
    nextAddress = `http://${saved.mode === "local" ? "127.0.0.1" : host}:${saved.port}`;
  }
  const losesAccess = saved.mode === "local" && !view.onServerComputer;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className={pageTitleStyles}>Network</h1>
        <p className="max-w-prose text-ink-2">
          Choose which computers can open DRAFTEX. A change takes effect when DRAFTEX restarts.
        </p>
      </header>

      <section aria-labelledby="now" className={`${sheetStyles} flex flex-col gap-3 p-5`}>
        <h2 id="now" className={eyebrowStyles}>
          Now
        </h2>
        <p className="text-body">
          <span className="font-medium">{MODE_LABEL[running.mode]}</span>
          <span className="text-ink-2"> · port {running.port}</span>
        </p>
        {view.lanUrls.length ? (
          <div className="flex flex-col gap-1">
            <p className="text-small text-ink-2">Other computers on this network open:</p>
            <ul className="flex flex-col gap-0.5">
              {view.lanUrls.map((u) => (
                <li key={u} className="font-mono text-body break-all select-all">
                  {u}
                </li>
              ))}
            </ul>
          </div>
        ) : running.mode === "lan" ? (
          <p className="text-small text-ink-2">
            This computer has no network address right now. Connect it to the network.
          </p>
        ) : null}
        {view.restartNeeded ? (
          <div className="flex flex-col gap-3 border-t border-rule pt-3">
            <p className="text-small">
              <span className="font-semibold">Saved, not yet in use:</span> {MODE_LABEL[saved.mode]}{" "}
              on port {saved.port}. Restart DRAFTEX to switch.
              {losesAccess
                ? " After the restart only the DRAFTEX computer itself can open it; this computer cannot."
                : ""}
            </p>
            {running.supervised ? (
              <RestartButton nextAddress={nextAddress} label="Restart now" variant="primary" />
            ) : (
              <p className="text-small text-ink-2">Stop DRAFTEX and start it again to switch.</p>
            )}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="choose" className="flex flex-col gap-4">
        <h2 id="choose" className={eyebrowStyles}>
          Who can open DRAFTEX
        </h2>
        <NetworkForm
          saved={{
            mode: saved.mode,
            port: String(saved.port),
            hostNames: saved.hostNames.join(", "),
            bindAddress: saved.bindAddress,
            trustedProxies: saved.trustedProxies.join(", "),
          }}
          onServerComputer={view.onServerComputer}
        />
      </section>

      {saved.mode === "lan" || running.mode === "lan" ? (
        <section aria-labelledby="firewall" className="flex flex-col gap-3">
          <h2 id="firewall" className={eyebrowStyles}>
            Firewall
          </h2>
          {view.firewall.applies ? (
            <FirewallControls
              ruleExists={view.firewall.ruleExists === true}
              onServerComputer={view.onServerComputer}
              port={saved.port}
            />
          ) : view.platform === "darwin" ? (
            <p className="max-w-prose text-small text-ink-2">
              The first time another computer connects, macOS may ask whether “node” may accept
              incoming network connections. Choose Allow on this Mac.
            </p>
          ) : (
            <p className="max-w-prose text-small text-ink-2">
              Allow incoming connections on port {saved.port} in this computer’s firewall.
            </p>
          )}
        </section>
      ) : null}

      <section aria-labelledby="restart" className="flex flex-col gap-3">
        <h2 id="restart" className={eyebrowStyles}>
          Restart
        </h2>
        <p className="max-w-prose text-small text-ink-2">
          Restarting takes a few seconds. Anyone using DRAFTEX sees “not reachable” until it is
          back; their saved work is kept. A restore waiting on the Backups page is finished by a
          restart.
        </p>
        {running.supervised ? (
          <RestartButton nextAddress={view.restartNeeded ? nextAddress : null} />
        ) : (
          <FormAlert kind="caution">
            This copy of DRAFTEX was not started by its start script, so it cannot restart itself.
            Stop it and start it again instead.
          </FormAlert>
        )}
      </section>
    </div>
  );
}
