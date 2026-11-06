// SPEC §11.3 CSRF, checked from the source. Two layers guard every change:
// the custom server refuses any non-GET request without a same-origin Origin
// (tests/unit/net/guard.test.ts, tests/e2e/network.spec.ts), and each route
// handler checks it again with sameOrigin(). Next.js checks server actions.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string, name: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, name) : name.test(e.name) ? [p] : [];
  });
}

const routes = files("src/app", /^route\.ts$/).map((file) => {
  const text = fs.readFileSync(file, "utf8");
  const methods = [
    ...text.matchAll(/export (?:async )?function (GET|HEAD|POST|PUT|PATCH|DELETE)\b/g),
  ].map((m) => m[1]!);
  return { file: file.split(path.sep).join("/"), text, methods };
});

describe("route handlers", () => {
  it("every handler that changes something checks the Origin itself", () => {
    const unsafe = routes.filter((r) => r.methods.some((m) => m !== "GET" && m !== "HEAD"));
    expect(unsafe.length).toBeGreaterThan(0);
    for (const r of unsafe) {
      expect(r.text, r.file).toMatch(/if \(!sameOrigin\(req\)\)/);
    }
  });

  it("GET handlers are the reviewed read-only ones (a new one needs a look first)", () => {
    expect(
      routes
        .filter((r) => r.methods.includes("GET"))
        .map((r) => r.file)
        .sort(),
    ).toEqual([
      "src/app/api/admin/backups/[name]/route.ts",
      "src/app/api/assets/[file]/route.ts",
      // D79: the CSV template, a fixed file with invented rows; no data read.
      "src/app/api/bank/template/route.ts",
      "src/app/api/papers/[id]/preview/route.ts",
      // D57: compiles a stored version, writes nothing; owner-only like the preview.
      "src/app/api/papers/[id]/versions/[versionId]/route.ts",
      "src/app/api/templates/[id]/preview/route.ts",
    ]);
  });
});

describe("server actions", () => {
  const modules = files("src", /\.tsx?$/).filter((f) =>
    /^\s*["']use server["']/.test(fs.readFileSync(f, "utf8")),
  );

  it("live only in src/server, where each one signs the caller in first", () => {
    expect(modules.length).toBeGreaterThan(0);
    for (const m of modules) {
      expect(m.split(path.sep).join("/"), m).toMatch(
        /^src\/server\/[\w-]+-?actions\.ts$|^src\/server\/actions\.ts$/,
      );
      const text = fs.readFileSync(m, "utf8");
      // Every exported action reaches a session check: requireUser/requireAdmin/requireSession,
      // a commands() helper that calls one, or the sign-in/setup/join flows that create the session.
      for (const fn of text.matchAll(/export async function (\w+)\([^]*?\n}/g)) {
        expect(fn[0], `${m} ${fn[1]}`).toMatch(
          /require(User|Admin|Session)\(|commands\(\)|getAuth\(\)|clearSessionCookie|sessionToken\(\)/,
        );
      }
    }
  });
});
