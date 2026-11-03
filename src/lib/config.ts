// <dataDir>/config.json (SPEC §5, §11.1). Phase 2 reads only the network mode;
// Phase 7 adds switching it. A missing file means the defaults.
import fs from "node:fs";
import { z } from "zod";

export const configSchema = z.object({
  mode: z.enum(["local", "lan", "server"]).default("local"),
});
export type AppConfig = z.output<typeof configSchema>;
export type NetworkMode = AppConfig["mode"];

export class ConfigError extends Error {
  override name = "ConfigError";
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
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(
      `The settings file "${file}" has a setting DRAFTEX does not understand: mode must be local, lan or server.`,
    );
  }
  return parsed.data;
}
