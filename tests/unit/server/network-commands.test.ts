// Gate 8 for the Network and Activity screens: administrators only;
// everyone else gets "not found". Settings are saved for the next start,
// the firewall helper only works on Windows from the DRAFTEX computer, and
// every change is audited without content.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readConfig } from "@/lib/config";
import type { Actor } from "@/lib/data";
import { ForbiddenError, NotFoundError } from "@/lib/data";
import {
  type Command,
  RULE_NAME,
  addCommand,
  removeCommand,
  statusCommand,
} from "@/lib/net/firewall";
import { RESTART_EXIT_CODE } from "@/lib/net/runtime";
import {
  FIREWALL_REFUSED,
  type NetworkDeps,
  NetworkInputError,
  networkCommands,
} from "@/server/network-commands";
import { createTestDb, type TestDb } from "../../support/db";

let t: TestDb;
let admin: Actor;
let faculty: Actor;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-network-"));
const configFile = path.join(dir, "config.json");

beforeAll(async () => {
  t = await createTestDb();
  const mk = async (email: string, role: "ADMIN" | "FACULTY") => {
    const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
    return { userId: u.id, role } as Actor;
  };
  admin = await mk("a@example.com", "ADMIN");
  faculty = await mk("f@example.com", "FACULTY");
});
afterAll(() => t.close());

function deps(over: Partial<NetworkDeps> = {}) {
  const ran: Command[] = [];
  const exits: number[] = [];
  const d: NetworkDeps = {
    configFile,
    running: { mode: "local", port: 3210, supervised: true },
    platform: "win32",
    interfaces: () => ({ en0: [{ address: "192.168.1.20", family: "IPv4", internal: false }] }),
    run: async (cmd) => {
      ran.push(cmd);
      return { code: 0 };
    },
    exit: (code) => exits.push(code),
    ...over,
  };
  return { d, ran, exits };
}

const form = (over: Record<string, string> = {}) => ({
  mode: "lan",
  port: "3210",
  hostNames: "",
  bindAddress: "",
  trustedProxies: "",
  ...over,
});

describe("for everyone but an administrator", () => {
  it("every network command and the activity log do not exist", async () => {
    const c = networkCommands(t.data, deps().d, faculty, "127.0.0.1");
    for (const call of [
      () => c.view(),
      () => c.save(form()),
      () => c.addFirewallRule(),
      () => c.removeFirewallRule(),
      () => c.restart(),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(t.data.audit.list(faculty)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(t.data.audit.actions(faculty)).rejects.toBeInstanceOf(ForbiddenError);
    expect(fs.existsSync(configFile)).toBe(false);
  });
});

describe("network settings, for an administrator", () => {
  it("show what is running and the LAN addresses", async () => {
    const { d } = deps({ running: { mode: "lan", port: 3210, supervised: true } });
    const v = await networkCommands(t.data, d, admin, "::ffff:127.0.0.1").view();
    expect(v).toMatchObject({
      running: { mode: "lan", port: 3210, supervised: true },
      saved: { mode: "local", port: 3210 },
      restartNeeded: true,
      lanUrls: ["http://192.168.1.20:3210"],
      onServerComputer: true,
      firewall: { applies: true, ruleExists: true },
    });
    const elsewhere = await networkCommands(
      t.data,
      deps({ platform: "darwin", running: null }).d,
      admin,
      "192.168.1.33",
    ).view();
    expect(elsewhere).toMatchObject({
      running: { mode: "local", supervised: false },
      restartNeeded: false,
      lanUrls: [],
      onServerComputer: false,
      firewall: { applies: false, ruleExists: null },
    });
  });

  it("are saved for the next start and audited, and bad values are explained", async () => {
    const c = networkCommands(t.data, deps().d, admin, "127.0.0.1");
    await c.save(form({ hostNames: "Exam-Office, lab-pc" }));
    expect(readConfig(configFile)).toMatchObject({
      mode: "lan",
      port: 3210,
      hostNames: ["exam-office", "lab-pc"],
    });
    await expect(c.save(form({ port: "80" }))).rejects.toThrow(/^Port must be a whole number/);
    await expect(c.save(form({ port: "abc" }))).rejects.toBeInstanceOf(NetworkInputError);
    await expect(c.save(form({ mode: "internet" }))).rejects.toThrow(/^Mode must be/);
    await expect(c.save(form({ mode: "server" }))).rejects.toThrow(
      /^Server mode needs the address/,
    );
    await expect(c.save(form({ hostNames: "http://x" }))).rejects.toThrow(/^Address name/);
    await expect(
      c.save(form({ mode: "server", hostNames: "papers.test", trustedProxies: "proxy" })),
    ).rejects.toThrow(/^Proxy address/);
    await expect(
      c.save(form({ mode: "server", hostNames: "papers.test", bindAddress: "here" })),
    ).rejects.toThrow(/^Listen address/);
    expect(readConfig(configFile).mode).toBe("lan");

    await c.save(
      form({
        mode: "server",
        port: "3300",
        hostNames: "papers.test",
        bindAddress: "10.0.0.5",
        trustedProxies: "10.0.0.2 10.0.0.3",
      }),
    );
    expect(readConfig(configFile)).toMatchObject({
      mode: "server",
      port: 3300,
      bindAddress: "10.0.0.5",
      trustedProxies: ["10.0.0.2", "10.0.0.3"],
    });
    // Leaving the server fields empty keeps what was there.
    await c.save(form({ mode: "local" }));
    expect(readConfig(configFile)).toMatchObject({
      mode: "local",
      bindAddress: "10.0.0.5",
      trustedProxies: ["10.0.0.2", "10.0.0.3"],
    });
    const rows = await t.db.auditLog.findMany({
      where: { entity: "Network" },
      orderBy: { at: "asc" },
    });
    expect(rows.map((r) => [r.action, r.detail, r.actorId])).toEqual([
      ["network:save", "lan:3210", admin.userId],
      ["network:save", "server:3300", admin.userId],
      ["network:save", "local:3210", admin.userId],
    ]);
  });

  it("rethrow what they do not expect", async () => {
    fs.writeFileSync(configFile, "{ broken");
    const c = networkCommands(t.data, deps().d, admin, "127.0.0.1");
    await expect(c.save(form())).rejects.toThrow(/not valid JSON/);
    fs.rmSync(configFile);
  });
});

describe("the firewall helper", () => {
  it("adds and removes the rule elevated, on Windows, from the DRAFTEX computer only", async () => {
    const { d, ran } = deps();
    const c = networkCommands(t.data, d, admin, "127.0.0.1");
    await c.addFirewallRule();
    await c.removeFirewallRule();
    expect(ran).toEqual([addCommand(3210), removeCommand()]);
    expect(
      (await t.db.auditLog.findMany({ where: { action: { startsWith: "firewall" } } })).map((r) => [
        r.action,
        r.detail,
      ]),
    ).toEqual([
      ["firewall:add", "3210"],
      ["firewall:remove", null],
    ]);

    const remote = networkCommands(t.data, d, admin, "192.168.1.33");
    await expect(remote.addFirewallRule()).rejects.toThrow(/on the DRAFTEX computer itself/);
    const mac = networkCommands(t.data, deps({ platform: "darwin" }).d, admin, "127.0.0.1");
    await expect(mac.removeFirewallRule()).rejects.toThrow(/Windows only/);
  });

  it("says so when Windows refuses (prompt declined)", async () => {
    const refusing = deps({ run: async () => ({ code: 1 }) }).d;
    const c = networkCommands(t.data, refusing, admin, "127.0.0.1");
    await expect(c.addFirewallRule()).rejects.toThrow(FIREWALL_REFUSED);
    await expect(c.removeFirewallRule()).rejects.toThrow(FIREWALL_REFUSED);
    expect((await c.view()).firewall.ruleExists).toBe(false);
  });

  it("builds only fixed commands around a checked port", () => {
    expect(statusCommand()).toEqual({
      file: "netsh.exe",
      args: ["advfirewall", "firewall", "show", "rule", `name=${RULE_NAME}`],
    });
    const add = addCommand(3210);
    expect(add.file).toBe("powershell.exe");
    const script = add.args.at(-1)!;
    expect(script).toContain("-Verb RunAs");
    expect(script).toContain(
      "add rule name=DRAFTEX dir=in action=allow protocol=TCP localport=3210 profile=private remoteip=localsubnet",
    );
    expect(script).toContain("delete rule name=DRAFTEX | Out-Null");
    expect(removeCommand().args.at(-1)).toContain("delete rule name=DRAFTEX; exit $LASTEXITCODE");
    for (const bad of [80, 3210.5, 70000, Number.NaN]) {
      expect(() => addCommand(bad)).toThrow(RangeError);
    }
  });
});

describe("restart", () => {
  it("exits with the restart code after answering, when supervised", async () => {
    vi.useFakeTimers();
    try {
      const { d, exits } = deps();
      await networkCommands(t.data, d, admin, "127.0.0.1").restart();
      expect(exits).toEqual([]);
      vi.advanceTimersByTime(300);
      expect(exits).toEqual([RESTART_EXIT_CODE]);
    } finally {
      vi.useRealTimers();
    }
    expect(await t.db.auditLog.count({ where: { action: "restart" } })).toBe(1);
  });

  it("is refused when nothing would start DRAFTEX again", async () => {
    const { d, exits } = deps({ running: { mode: "local", port: 3210, supervised: false } });
    await expect(networkCommands(t.data, d, admin, "127.0.0.1").restart()).rejects.toThrow(
      /cannot restart itself/,
    );
    expect(exits).toEqual([]);
  });
});

describe("the activity log", () => {
  it("lists newest first, filters, pages, and clamps the page", async () => {
    for (let i = 0; i < 5; i++) {
      await t.data.audit.record({ actorId: faculty.userId, action: "sign-in", entity: "User" });
    }
    const all = await t.data.audit.list(admin, { pageSize: 3 });
    expect(all.page).toBe(1);
    expect(all.rows).toHaveLength(3);
    expect(all.total).toBeGreaterThan(5);
    const times = all.rows.map((r) => r.at.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const signIns = await t.data.audit.list(admin, { action: "sign-in", actorId: faculty.userId });
    expect(signIns.total).toBe(5);
    expect(signIns.rows.every((r) => r.actor?.name === "f@example.com")).toBe(true);

    const last = await t.data.audit.list(admin, { action: "sign-in", pageSize: 2, page: 99 });
    expect(last).toMatchObject({ page: 3, pages: 3 });
    expect((await t.data.audit.list(admin, { page: -4 })).page).toBe(1);
    expect((await t.data.audit.list(admin, { action: "none" })).rows).toEqual([]);
    expect(await t.data.audit.actions(admin)).toEqual(
      expect.arrayContaining(["sign-in", "network:save", "restart"]),
    );
  });
});
