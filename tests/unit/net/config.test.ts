import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_PORT, parseConfig, readConfig, writeConfig } from "@/lib/config";

const defaults = {
  mode: "local",
  port: DEFAULT_PORT,
  hostNames: [],
  bindAddress: "127.0.0.1",
  trustedProxies: ["127.0.0.1", "::1"],
};

describe("config.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-config-"));
  const file = path.join(dir, "config.json");

  it("defaults to local mode on port 3210 when missing", () => {
    expect(readConfig(path.join(dir, "missing.json"))).toEqual(defaults);
  });

  it("reads mode, port and host names, and drops unknown keys", () => {
    fs.writeFileSync(
      file,
      JSON.stringify({ mode: "lan", port: 3300, hostNames: [" Lab-PC "], later: 1 }),
    );
    expect(readConfig(file)).toEqual({
      ...defaults,
      mode: "lan",
      port: 3300,
      hostNames: ["lab-pc"],
    });
  });

  it("explains bad JSON, bad values and unreadable files", () => {
    fs.writeFileSync(file, "{");
    expect(() => readConfig(file)).toThrow(/not valid JSON/);
    fs.writeFileSync(file, JSON.stringify({ mode: "internet" }));
    expect(() => readConfig(file)).toThrow(/mode must be local, lan or server/);
    fs.writeFileSync(file, JSON.stringify({ port: 80 }));
    expect(() => readConfig(file)).toThrow(/port must be a whole number from 1024 to 65535/);
    fs.writeFileSync(file, JSON.stringify({ trustedProxies: ["proxy.local"] }));
    expect(() => readConfig(file)).toThrow(/trustedProxies.0 must be an IP address/);
    expect(() =>
      readConfig(file, () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      }),
    ).toThrow(ConfigError);
  });

  it("needs a host name in server mode and refuses malformed names", () => {
    expect(() => parseConfig({ mode: "server" })).toThrow(/server mode needs the name/);
    expect(() => parseConfig({ hostNames: ["http://x"] })).toThrow(/host name/);
    expect(() => parseConfig({ hostNames: ["-bad.example"] })).toThrow(/host name/);
    expect(parseConfig({ mode: "server", hostNames: ["papers.college.edu"] }).mode).toBe("server");
  });

  it("writes atomically and reads back the same settings", () => {
    const cfg = parseConfig({ mode: "lan", port: 3222 });
    writeConfig(file, cfg);
    expect(readConfig(file)).toEqual(cfg);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(() => writeConfig(file, { ...cfg, port: 1 })).toThrow(ConfigError);
    expect(readConfig(file)).toEqual(cfg);
  });
});
