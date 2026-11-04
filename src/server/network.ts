// Real dependencies for the Network screen.
import os from "node:os";
import { runCommand } from "@/lib/net/firewall";
import { lanAddresses } from "@/lib/net/guard";
import { runningFrom } from "@/lib/net/runtime";
import { dataPaths, getDataDir } from "@/lib/paths";
import type { NetworkDeps } from "./network-commands";

export function networkDeps(): NetworkDeps {
  return {
    configFile: dataPaths(getDataDir()).config,
    running: runningFrom(process.env),
    platform: process.platform,
    interfaces: () => os.networkInterfaces(),
    run: runCommand,
    exit: (code) => process.exit(code),
  };
}

/** Addresses for the LAN banner (SPEC §11.1), or null when DRAFTEX is not open to the network. */
export function lanBannerUrls(): string[] | null {
  const running = runningFrom(process.env);
  if (running?.mode !== "lan") return null;
  return lanAddresses(os.networkInterfaces()).map((a) => `http://${a}:${running.port}`);
}
