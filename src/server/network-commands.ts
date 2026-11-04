// What the Network screen can ask for (SPEC §11.1, D36–D40). Administrators
// only: everyone else gets "not found". Independent of Next.js so gate 8
// and the unit tests can call it directly.
import { type AppConfig, ConfigError, parseConfig, readConfig, writeConfig } from "@/lib/config";
import { type Actor, type DataLayer, NotFoundError } from "@/lib/data";
import { type Run, addCommand, removeCommand, ruleExists } from "@/lib/net/firewall";
import { type NetworkInterfaceInfo, isLoopback, lanAddresses } from "@/lib/net/guard";
import { RESTART_EXIT_CODE, type Running } from "@/lib/net/runtime";

export interface NetworkDeps {
  configFile: string;
  /** Null outside the custom server (then the saved settings stand in). */
  running: Running | null;
  platform: NodeJS.Platform;
  interfaces: () => Record<string, NetworkInterfaceInfo[] | undefined>;
  run: Run;
  /** Ends the process so the supervisor starts it again. */
  exit: (code: number) => void;
}

export interface NetworkSettingsInput {
  mode: string;
  port: string;
  hostNames: string;
  bindAddress: string;
  trustedProxies: string;
}

export interface NetworkView {
  running: { mode: AppConfig["mode"]; port: number; supervised: boolean };
  saved: AppConfig;
  /** Saved settings differ from what is running, so a restart is due. */
  restartNeeded: boolean;
  /** Addresses other computers type in LAN mode. */
  lanUrls: string[];
  /** The admin is using the DRAFTEX computer itself. */
  onServerComputer: boolean;
  platform: NodeJS.Platform;
  firewall: { applies: boolean; ruleExists: boolean | null };
}

export class NetworkInputError extends Error {
  override name = "NetworkInputError";
}

const list = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function networkCommands(
  data: Pick<DataLayer, "audit">,
  deps: NetworkDeps,
  actor: Actor,
  clientAddress: string,
) {
  const admin = () => {
    if (actor.role !== "ADMIN") throw new NotFoundError("Page");
  };
  const audit = (action: string, detail: string | null) =>
    data.audit.record({ actorId: actor.userId, action, entity: "Network", detail });
  const saved = () => readConfig(deps.configFile);
  const running = (): Running => {
    if (deps.running) return deps.running;
    const s = saved();
    return { mode: s.mode, port: s.port, supervised: false };
  };
  const firewallAllowed = () => {
    if (deps.platform !== "win32") {
      throw new NetworkInputError("The firewall helper is for Windows only.");
    }
    if (!isLoopback(clientAddress)) {
      throw new NetworkInputError(
        "Do this on the DRAFTEX computer itself: Windows asks for permission on its screen.",
      );
    }
  };

  return {
    async view(): Promise<NetworkView> {
      admin();
      const s = saved();
      const r = running();
      const urls =
        r.mode === "lan" ? lanAddresses(deps.interfaces()).map((a) => `http://${a}:${r.port}`) : [];
      const applies = deps.platform === "win32";
      return {
        running: { mode: r.mode, port: r.port, supervised: r.supervised },
        saved: s,
        restartNeeded: s.mode !== r.mode || s.port !== r.port,
        lanUrls: urls,
        onServerComputer: isLoopback(clientAddress),
        platform: deps.platform,
        firewall: { applies, ruleExists: applies ? await ruleExists(deps.run) : null },
      };
    },

    /** Saves the settings for the next start; nothing changes until a restart. */
    async save(input: NetworkSettingsInput): Promise<AppConfig> {
      admin();
      const current = saved();
      let next: AppConfig;
      try {
        next = parseConfig({
          ...current,
          mode: input.mode,
          port: Number(input.port.trim()),
          hostNames: list(input.hostNames),
          bindAddress: input.bindAddress.trim() || current.bindAddress,
          trustedProxies: list(input.trustedProxies).length
            ? list(input.trustedProxies)
            : current.trustedProxies,
        });
      } catch (e) {
        if (e instanceof ConfigError) throw new NetworkInputError(sentence(e.message));
        throw e;
      }
      writeConfig(deps.configFile, next);
      await audit("network:save", `${next.mode}:${next.port}`);
      return next;
    },

    async addFirewallRule(): Promise<void> {
      admin();
      firewallAllowed();
      const port = saved().port;
      const { code } = await deps.run(addCommand(port));
      if (code !== 0) throw new NetworkInputError(FIREWALL_REFUSED);
      await audit("firewall:add", String(port));
    },

    async removeFirewallRule(): Promise<void> {
      admin();
      firewallAllowed();
      const { code } = await deps.run(removeCommand());
      if (code !== 0) throw new NetworkInputError(FIREWALL_REFUSED);
      await audit("firewall:remove", null);
    },

    /** Restarts through the supervisor; the response goes out before the process ends. */
    async restart(): Promise<void> {
      admin();
      if (!running().supervised) {
        throw new NetworkInputError(
          "This copy of DRAFTEX was not started by its start script, so it cannot restart itself. Stop it and start it again.",
        );
      }
      await audit("restart", null);
      setTimeout(() => deps.exit(RESTART_EXIT_CODE), 300);
    },
  };
}

export const FIREWALL_REFUSED =
  "Windows did not make the change. The permission prompt may have been declined; try again and choose Yes.";

/** Config messages name JSON keys; the screen names its fields. */
function sentence(message: string): string {
  return message
    .replace(/^.*?understand: /, "")
    .replace(/^hostNames(\.\d+)?/, "Address name")
    .replace(/^bindAddress/, "Listen address")
    .replace(/^trustedProxies(\.\d+)?/, "Proxy address")
    .replace(/^port/, "Port")
    .replace(/^mode/, "Mode");
}
