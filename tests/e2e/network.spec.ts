// Phase 7: network modes and request hardening (SPEC §11.1, §11.3, §11.6).
// Runs after auth.spec.ts, whose accounts it uses. Switches the e2e server
// to LAN mode and back through "Restart DRAFTEX", and starts one more
// throwaway server in server mode. Test data only.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { ADMIN, FACULTY, asUser } from "./support";

test.describe.configure({ mode: "serial", timeout: 120_000 });

const PORT = 3211;
const SERVER_PORT = 3218;

interface Raw {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** A request with exactly these headers (browsers and Playwright fix Host and Origin themselves). */
function raw(
  port: number,
  opts: { method?: string; path?: string; headers?: Record<string, string> },
): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: opts.method ?? "GET",
        path: opts.path ?? "/login",
        headers: { Host: `127.0.0.1:${port}`, ...opts.headers },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end(opts.method && opts.method !== "GET" ? "{}" : undefined);
  });
}

test("every page carries the security headers and a fresh script nonce", async () => {
  const a = await raw(PORT, {});
  expect(a.status).toBe(200);
  expect(a.headers["x-frame-options"]).toBe("DENY");
  expect(a.headers["x-content-type-options"]).toBe("nosniff");
  expect(a.headers["referrer-policy"]).toBe("same-origin");
  expect(a.headers["strict-transport-security"]).toBeUndefined();
  const csp = String(a.headers["content-security-policy"]);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("unsafe-eval");
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce).toBeTruthy();
  const scripts = a.body.match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const s of scripts) expect(s).toContain(`nonce="${nonce}"`);
  const b = await raw(PORT, {});
  expect(String(b.headers["content-security-policy"])).not.toContain(nonce!);
});

test("a page that points its own name at DRAFTEX is refused (DNS rebinding)", async () => {
  for (const host of ["attacker.example:3211", "127.0.0.1:9", "attacker.example"]) {
    const r = await raw(PORT, { headers: { Host: host } });
    expect(r.status, host).toBe(421);
    expect(r.body).toContain("does not answer to this address");
  }
});

test("a change from another site, or with no Origin, is refused before the app sees it", async () => {
  for (const origin of [undefined, "http://attacker.example", "http://localhost:3211"]) {
    for (const p of ["/login", "/api/assets", "/api/admin/restore", "/api/templates/preview"]) {
      const r = await raw(PORT, {
        method: "POST",
        path: p,
        headers: {
          "Content-Type": "application/json",
          "Next-Action": "0".repeat(40),
          ...(origin && { Origin: origin }),
        },
      });
      expect(r.status, `${origin} ${p}`).toBe(403);
      expect(r.body).toContain("did not come from a DRAFTEX page");
    }
  }
  // The same request from the app's own origin reaches the app (and is refused there: not signed in).
  const own = await raw(PORT, {
    method: "POST",
    path: "/api/assets",
    headers: { Origin: `http://127.0.0.1:${PORT}`, "Content-Type": "application/json" },
  });
  expect(own.status).toBe(401);
});

test("the Network and Activity screens are for administrators only", async ({ browser }) => {
  const faculty = await asUser(browser, FACULTY, FACULTY.own);
  for (const url of ["/admin/network", "/admin/activity"]) {
    expect((await faculty.goto(url))?.status(), url).toBe(404);
  }
  await expect(faculty.getByRole("link", { name: "Network" })).toHaveCount(0);
  await faculty.context().close();
});

async function switchTo(page: Page, mode: RegExp) {
  await page.goto("/admin/network");
  await page.getByRole("radio", { name: mode }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved, not yet in use")).toBeVisible();
  await page.getByRole("button", { name: "Restart now" }).click();
  await expect(page.getByText("Saved, not yet in use")).toBeHidden({ timeout: 90_000 });
}

test("LAN mode: the admin switches, restarts, and everyone sees the banner", async ({
  browser,
}) => {
  const admin = await asUser(browser, ADMIN, ADMIN.password);
  await switchTo(admin, /^This network/);
  const banner = admin.getByRole("note", { name: "Network" });
  await expect(banner).toContainText("Open to this network");
  await expect(banner).toContainText("Use only on a network you trust");
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254."));
  if (addresses.length) {
    await expect(banner).toContainText(`http://${addresses[0]!.address}:${PORT}`);
    // Another computer would use that address; the server now answers to it.
    const r = await raw(PORT, { headers: { Host: `${addresses[0]!.address}:${PORT}` } });
    expect(r.status).toBe(200);
  }

  const faculty = await asUser(browser, FACULTY, FACULTY.own);
  await faculty.goto("/papers");
  await expect(faculty.getByRole("note", { name: "Network" })).toBeVisible();
  await faculty.context().close();

  await switchTo(admin, /^This computer only/);
  await expect(admin.getByRole("note", { name: "Network" })).toHaveCount(0);

  await admin.goto("/admin/activity");
  const table = admin.getByRole("table");
  await expect(table).toContainText("Changed network settings · this network, port 3211");
  await expect(table).toContainText("Changed network settings · this computer only, port 3211");
  await expect(table).toContainText("Restarted DRAFTEX");
  await admin.goto("/admin/activity?action=sign-in");
  await expect(admin.getByRole("table")).toContainText("Signed in · from 127.0.0.1");
  await admin.context().close();
});

test.describe("server mode", () => {
  let server: ChildProcess | undefined;
  const dir = path.join(os.tmpdir(), "draftex-e2e-server-mode");
  const require = createRequire(import.meta.url);

  test.afterAll(() => {
    server?.kill();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  });

  test("answers only to its public name, through HTTPS from its proxy", async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ mode: "server", port: SERVER_PORT, hostNames: ["papers.test"] }),
    );
    const env = { ...process.env, DRAFTEX_DATA_DIR: dir, CHECKPOINT_DISABLE: "1" };
    execFileSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        env,
        stdio: "ignore",
      },
    );
    server = spawn(process.execPath, [path.resolve("server.ts")], { env, stdio: "ignore" });

    // No account exists yet, so /setup is the page that answers.
    const viaProxy = { Host: "papers.test", "X-Forwarded-Proto": "https" };
    const setupPage = { path: "/setup", headers: viaProxy };
    await expect
      .poll(async () => (await raw(SERVER_PORT, setupPage).catch(() => null))?.status, {
        timeout: 90_000,
      })
      .toBe(200);

    const ok = await raw(SERVER_PORT, setupPage);
    expect(ok.headers["strict-transport-security"]).toBe("max-age=31536000");
    expect(String(ok.headers["content-security-policy"])).toContain("upgrade-insecure-requests");

    expect(
      (await raw(SERVER_PORT, { path: "/setup", headers: { Host: "papers.test" } })).status,
    ).toBe(403);
    expect(
      (await raw(SERVER_PORT, { headers: { Host: "papers.test", "X-Forwarded-Proto": "http" } }))
        .status,
    ).toBe(403);
    expect((await raw(SERVER_PORT, {})).status).toBe(421);

    // First-run setup is only for local mode, so nobody on the network can claim the admin account.
    const setup = ok;
    expect(setup.body).toContain("Set up DRAFTEX on its own computer");
    expect(setup.body).not.toContain("Create administrator");
  });
});
