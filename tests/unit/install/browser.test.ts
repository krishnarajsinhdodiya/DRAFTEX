import { describe, expect, it } from "vitest";
import { alreadyRunning, browserCommand, localAppUrl, waitUntil } from "@/lib/install/browser";

describe("localAppUrl", () => {
  it("opens loopback in local and lan mode, nothing in server mode", () => {
    expect(localAppUrl({ mode: "local", port: 3210 })).toBe("http://127.0.0.1:3210/");
    expect(localAppUrl({ mode: "lan", port: 4000 })).toBe("http://127.0.0.1:4000/");
    expect(localAppUrl({ mode: "server", port: 3210 })).toBeNull();
  });
});

describe("browserCommand", () => {
  it("uses each OS's own opener without a shell", () => {
    const url = "http://127.0.0.1:3210/";
    expect(browserCommand("win32", url)).toEqual({
      file: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url],
    });
    expect(browserCommand("darwin", url)).toEqual({ file: "open", args: [url] });
    expect(browserCommand("linux", url)).toEqual({ file: "xdg-open", args: [url] });
  });
});

describe("waitUntil", () => {
  it("stops as soon as the probe answers", async () => {
    let calls = 0;
    const slept: number[] = [];
    const ok = await waitUntil(
      async () => ++calls === 3,
      10_000,
      250,
      async (ms) => {
        slept.push(ms);
      },
      () => 0,
    );
    expect(ok).toBe(true);
    expect(calls).toBe(3);
    expect(slept).toEqual([250, 250]);
  });

  it("gives up after the timeout", async () => {
    let t = 0;
    const ok = await waitUntil(
      async () => false,
      1_000,
      400,
      async (ms) => {
        t += ms;
      },
      () => t,
    );
    expect(ok).toBe(false);
    expect(t).toBe(1_200);
  });

  it("uses real timers by default", async () => {
    expect(await waitUntil(async () => true, 10)).toBe(true);
    let n = 0;
    expect(await waitUntil(async () => ++n > 1, 1_000, 1)).toBe(true);
  });
});

describe("alreadyRunning", () => {
  const now = (async (probe: () => Promise<boolean>) => probe()) as typeof waitUntil;
  it("starts when no lock says otherwise", async () => {
    expect(await alreadyRunning(false, "http://127.0.0.1:3210/", async () => true, 0, now)).toBe(
      false,
    );
  });
  it("trusts a lock only when DRAFTEX answers (Windows reuses process ids)", async () => {
    const url = "http://127.0.0.1:3210/";
    expect(await alreadyRunning(true, url, async () => true, 0, now)).toBe(true);
    expect(await alreadyRunning(true, url, async () => false, 0, now)).toBe(false);
  });
  it("gives a copy that is still starting time to answer", async () => {
    let calls = 0;
    const r = await alreadyRunning(
      true,
      "http://127.0.0.1:3210/",
      async () => ++calls >= 3,
      1_000,
      (probe, ms) => waitUntil(probe, ms, 1),
    );
    expect(r).toBe(true);
    expect(calls).toBe(3);
  });
  it("keeps trusting the lock where there is no local address (server mode)", async () => {
    expect(await alreadyRunning(true, null, async () => false, 0, now)).toBe(true);
  });
});
