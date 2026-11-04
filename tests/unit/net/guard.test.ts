import { describe, expect, it } from "vitest";
import { parseConfig } from "@/lib/config";
import {
  CROSS_SITE,
  NEEDS_HTTPS,
  WRONG_HOST,
  allowedHosts,
  clientAddressOf,
  guardRequest,
  isLoopback,
  lanAddresses,
  stripMapped,
} from "@/lib/net/guard";

const machine = { lanAddresses: ["192.168.1.20"], hostname: "Lab-PC" };
const local = parseConfig({});
const lan = parseConfig({ mode: "lan", hostNames: ["exam-office"] });
const server = parseConfig({
  mode: "server",
  hostNames: ["papers.college.edu"],
  trustedProxies: ["10.0.0.2"],
});

function req(over: Partial<Parameters<typeof guardRequest>[0]> = {}) {
  return {
    method: "GET",
    host: "127.0.0.1:3210",
    origin: undefined,
    socketAddress: "127.0.0.1",
    forwardedFor: undefined,
    forwardedProto: undefined,
    ...over,
  };
}

describe("addresses", () => {
  it("recognises loopback and IPv4-mapped addresses", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("127.8.0.1")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("192.168.1.5")).toBe(false);
    expect(stripMapped("::FFFF:10.0.0.1")).toBe("10.0.0.1");
    expect(stripMapped("::ffff:zz")).toBe("::ffff:zz");
  });

  it("lists external IPv4 addresses only, without link-local ones", () => {
    expect(
      lanAddresses({
        lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
        en0: [
          { address: "192.168.1.20", family: "IPv4", internal: false },
          { address: "fe80::1", family: "IPv6", internal: false },
        ],
        en1: [{ address: "10.0.0.7", family: 4, internal: false }],
        en2: [{ address: "169.254.3.3", family: "IPv4", internal: false }],
        gone: undefined,
      }),
    ).toEqual(["10.0.0.7", "192.168.1.20"]);
  });
});

describe("allowed hosts", () => {
  it("local mode answers only to loopback names on its port", () => {
    expect([...allowedHosts(local, machine)].sort()).toEqual([
      "127.0.0.1:3210",
      "[::1]:3210",
      "localhost:3210",
    ]);
  });

  it("lan mode adds the machine's addresses, its names and configured names", () => {
    const hosts = allowedHosts(lan, machine);
    for (const h of [
      "192.168.1.20:3210",
      "lab-pc:3210",
      "lab-pc.local:3210",
      "exam-office:3210",
      "localhost:3210",
    ]) {
      expect(hosts.has(h), h).toBe(true);
    }
    expect(hosts.has("192.168.1.20")).toBe(false);
  });

  it("server mode answers only to its public names", () => {
    expect([...allowedHosts(server, machine)]).toEqual(["papers.college.edu"]);
  });
});

describe("client address", () => {
  it("is the socket address outside server mode, whatever the client claims", () => {
    expect(clientAddressOf("::ffff:192.168.1.9", "1.2.3.4", lan)).toBe("192.168.1.9");
    expect(clientAddressOf("127.0.0.1", "1.2.3.4", local)).toBe("127.0.0.1");
  });

  it("in server mode trusts x-forwarded-for only from a trusted proxy", () => {
    expect(clientAddressOf("10.0.0.2", "172.16.0.5", server)).toBe("172.16.0.5");
    expect(clientAddressOf("10.0.0.9", "172.16.0.5", server)).toBe("10.0.0.9");
    expect(clientAddressOf("10.0.0.2", undefined, server)).toBe("10.0.0.2");
  });

  it("takes the nearest untrusted hop, so a forged first entry is ignored", () => {
    expect(clientAddressOf("10.0.0.2", "6.6.6.6, 172.16.0.5", server)).toBe("172.16.0.5");
    expect(clientAddressOf("10.0.0.2", "172.16.0.5, 10.0.0.2", server)).toBe("172.16.0.5");
    expect(clientAddressOf("10.0.0.2", "10.0.0.2", server)).toBe("10.0.0.2");
    expect(clientAddressOf("10.0.0.2", "not-an-ip", server)).toBe("10.0.0.2");
    expect(clientAddressOf("10.0.0.2", " , ", server)).toBe("10.0.0.2");
  });
});

describe("request guard", () => {
  const localHosts = allowedHosts(local, machine);
  const lanHosts = allowedHosts(lan, machine);
  const serverHosts = allowedHosts(server, machine);

  it("passes a page load and returns the client address", () => {
    expect(guardRequest(req(), local, localHosts)).toEqual({
      ok: true,
      clientAddress: "127.0.0.1",
    });
  });

  it("refuses unknown or missing Host headers (DNS rebinding)", () => {
    for (const host of ["evil.example:3210", "127.0.0.1:9999", undefined, "192.168.1.20:3210"]) {
      expect(guardRequest(req({ host }), local, localHosts)).toEqual({
        ok: false,
        status: 421,
        message: WRONG_HOST,
      });
    }
    expect(guardRequest(req({ host: "LOCALHOST:3210" }), local, localHosts).ok).toBe(true);
  });

  it("needs a same-origin Origin on every mutation", () => {
    const refused = { ok: false, status: 403, message: CROSS_SITE };
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(guardRequest(req({ method }), local, localHosts), method).toEqual(refused);
    }
    for (const origin of [
      "http://evil.example",
      "http://localhost:3210",
      "https://127.0.0.1:3210",
      "null",
      "not a url",
    ]) {
      expect(guardRequest(req({ method: "POST", origin }), local, localHosts), origin).toEqual(
        refused,
      );
    }
    expect(
      guardRequest(req({ method: "POST", origin: "http://127.0.0.1:3210" }), local, localHosts).ok,
    ).toBe(true);
    expect(guardRequest(req({ method: "HEAD" }), local, localHosts).ok).toBe(true);
    expect(guardRequest(req({ method: "OPTIONS" }), local, localHosts).ok).toBe(true);
  });

  it("lan mode accepts the machine's address from another computer", () => {
    expect(
      guardRequest(
        req({
          method: "POST",
          host: "192.168.1.20:3210",
          origin: "http://192.168.1.20:3210",
          socketAddress: "::ffff:192.168.1.33",
          forwardedFor: "127.0.0.1",
        }),
        lan,
        lanHosts,
      ),
    ).toEqual({ ok: true, clientAddress: "192.168.1.33" });
  });

  it("server mode needs https through a trusted proxy", () => {
    const base = { host: "papers.college.edu", socketAddress: "10.0.0.2" };
    expect(guardRequest(req({ ...base, forwardedProto: "http" }), server, serverHosts)).toEqual({
      ok: false,
      status: 403,
      message: NEEDS_HTTPS,
    });
    expect(
      guardRequest(
        req({ ...base, socketAddress: "10.0.0.9", forwardedProto: "https" }),
        server,
        serverHosts,
      ).ok,
    ).toBe(false);
    expect(guardRequest(req(base), server, serverHosts).ok).toBe(false);
    expect(
      guardRequest(
        req({ ...base, forwardedProto: "https, http", forwardedFor: "172.16.0.5" }),
        server,
        serverHosts,
      ),
    ).toEqual({ ok: true, clientAddress: "172.16.0.5" });
    expect(
      guardRequest(
        req({
          ...base,
          method: "POST",
          forwardedProto: "https",
          origin: "http://papers.college.edu",
        }),
        server,
        serverHosts,
      ).ok,
    ).toBe(false);
    expect(
      guardRequest(
        req({
          ...base,
          method: "POST",
          forwardedProto: "https",
          origin: "https://papers.college.edu",
        }),
        server,
        serverHosts,
      ).ok,
    ).toBe(true);
  });
});
