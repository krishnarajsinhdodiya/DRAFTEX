// Windows Firewall helper for LAN mode (SPEC §11.1, D39). Adding or
// removing the rule needs administrator rights, so it runs elevated and
// Windows shows its permission (UAC) prompt on the DRAFTEX computer.
// The rule lets in TCP on DRAFTEX's port only, on private networks only,
// from the local subnet only.
import { execFile } from "node:child_process";

export const RULE_NAME = "DRAFTEX";

export interface Command {
  file: string;
  args: string[];
}

function checkedPort(port: number): number {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new RangeError(`Not a DRAFTEX port: ${port}`);
  }
  return port;
}

/** Shows the rule; exit code 0 when it exists. Needs no elevation. */
export function statusCommand(): Command {
  return {
    file: "netsh.exe",
    args: ["advfirewall", "firewall", "show", "rule", `name=${RULE_NAME}`],
  };
}

/**
 * Elevation goes through PowerShell's Start-Process -Verb RunAs, the only
 * standard way to raise the UAC prompt. The script is built from constants
 * and a port checked to be an integer, so no outside text reaches it.
 */
function elevated(netshLines: string[]): Command {
  const inner = [...netshLines, "exit $LASTEXITCODE"].join("; ");
  const script =
    `$p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden ` +
    `-ArgumentList @('-NoProfile', '-NonInteractive', '-Command', '${inner}'); exit $p.ExitCode`;
  return { file: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", script] };
}

/** Replaces any earlier DRAFTEX rule (an old port) with one for `port`. */
export function addCommand(port: number): Command {
  const p = checkedPort(port);
  return elevated([
    `netsh advfirewall firewall delete rule name=${RULE_NAME} | Out-Null`,
    `netsh advfirewall firewall add rule name=${RULE_NAME} dir=in action=allow protocol=TCP localport=${p} profile=private remoteip=localsubnet`,
  ]);
}

export function removeCommand(): Command {
  return elevated([`netsh advfirewall firewall delete rule name=${RULE_NAME}`]);
}

export type Run = (cmd: Command) => Promise<{ code: number }>;

/* v8 ignore start -- spawns real Windows tools; the commands above are unit-tested */
export const runCommand: Run = (cmd) =>
  new Promise((resolve) => {
    execFile(cmd.file, cmd.args, { windowsHide: true, timeout: 120_000 }, (error) => {
      const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolve({ code });
    });
  });
/* v8 ignore stop */

export async function ruleExists(run: Run = runCommand): Promise<boolean> {
  return (await run(statusCommand())).code === 0;
}
