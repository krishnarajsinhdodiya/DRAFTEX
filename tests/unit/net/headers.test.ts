import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, newNonce, securityHeaders } from "@/lib/net/headers";
import { ENV, runningFrom } from "@/lib/net/runtime";

describe("security headers", () => {
  it("deny framing and sniffing in every mode; HSTS only behind HTTPS", () => {
    for (const mode of ["local", "lan", "server"] as const) {
      const h = securityHeaders(mode);
      expect(h["X-Frame-Options"]).toBe("DENY");
      expect(h["X-Content-Type-Options"]).toBe("nosniff");
      expect(h["Referrer-Policy"]).toBe("same-origin");
      expect(h["Strict-Transport-Security"] !== undefined).toBe(mode === "server");
    }
  });

  it("CSP: nonce scripts, no eval in production, inline styles only (D41)", () => {
    const csp = contentSecurityPolicy("abc", { mode: "local", dev: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic';");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy("abc", { mode: "server", dev: false })).toContain(
      "upgrade-insecure-requests",
    );
    const dev = contentSecurityPolicy("abc", { mode: "lan", dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("connect-src 'self' ws: wss:");
  });

  it("nonces are random and 128 bits", () => {
    const a = newNonce();
    expect(Buffer.from(a, "base64")).toHaveLength(16);
    expect(newNonce()).not.toBe(a);
  });
});

describe("running settings", () => {
  it("come from the server's environment, or null outside it", () => {
    expect(runningFrom({ [ENV.mode]: "lan", [ENV.port]: "3210", [ENV.supervised]: "1" })).toEqual({
      mode: "lan",
      port: 3210,
      supervised: true,
    });
    expect(runningFrom({ [ENV.mode]: "local", [ENV.port]: "3211" })?.supervised).toBe(false);
    expect(runningFrom({})).toBeNull();
    expect(runningFrom({ [ENV.mode]: "wan", [ENV.port]: "1" })).toBeNull();
    expect(runningFrom({ [ENV.mode]: "lan", [ENV.port]: "x" })).toBeNull();
  });
});
