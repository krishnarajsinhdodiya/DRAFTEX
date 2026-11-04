// <dataDir>/config.json (SPEC §5, §11.1): network mode, port and the
// addresses DRAFTEX answers to. A missing file means the defaults. The
// server reads it once at start; changes apply after a restart (D36, D37).
// Imported by server.ts under Node type stripping: relative imports only.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_PORT = 3210;
const LOOPBACK = ["127.0.0.1", "::1"];

const ipAddress = z.string().refine((s) => net.isIP(s) !== 0, "must be an IP address");
/** A plain host name as typed in a browser, without port or scheme. */
const hostName = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/, {
    message: "must be a host name such as papers.college.edu",
  });

export const configSchema = z
  .object({
    mode: z.enum(["local", "lan", "server"]).default("local"),
    port: z.number().int().min(1024).max(65535).default(DEFAULT_PORT),
    /** Extra names browsers may use for this computer (lan) or the proxy's public name (server). */
    hostNames: z.array(hostName).max(10).default([]),
    /** Server mode: the address to listen on, usually loopback behind a proxy on the same machine. */
    bindAddress: ipAddress.default("127.0.0.1"),
    /** Server mode: only these addresses may say who the client is and that it used HTTPS. */
    trustedProxies: z.array(ipAddress).min(1).max(10).default(LOOPBACK),
  })
  .refine((c) => c.mode !== "server" || c.hostNames.length > 0, {
    path: ["hostNames"],
    message: "server mode needs the name people type to reach DRAFTEX",
  });
export type AppConfig = z.output<typeof configSchema>;
export type NetworkMode = AppConfig["mode"];

export class ConfigError extends Error {
  override name = "ConfigError";
}

function describe(error: z.ZodError): string {
  const issue = error.issues[0]!;
  const where = issue.path.join(".") || "the file";
  if (issue.path[0] === "mode") return "mode must be local, lan or server.";
  if (issue.path[0] === "port") return "port must be a whole number from 1024 to 65535.";
  return `${where} ${issue.message}.`;
}

export function parseConfig(raw: unknown): AppConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) throw new ConfigError(describe(parsed.error));
  return parsed.data;
}

export function readConfig(
  file: string,
  read: (f: string) => string = (f) => fs.readFileSync(f, "utf8"),
): AppConfig {
  let text: string;
  try {
    text = read(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return configSchema.parse({});
    throw new ConfigError(`DRAFTEX cannot read its settings file "${file}".`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ConfigError(`The settings file "${file}" is not valid JSON.`);
  }
  try {
    return parseConfig(raw);
  } catch (e) {
    throw new ConfigError(
      `The settings file "${file}" has a setting DRAFTEX does not understand: ${(e as Error).message}`,
    );
  }
}

/** Writes the settings atomically (temporary file, then rename), so a crash never leaves half a file. */
export function writeConfig(file: string, config: AppConfig): void {
  const checked = parseConfig(config);
  const tmp = path.join(path.dirname(file), `.config-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(checked, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}
