// Request checks the custom server runs before Next.js sees a request (D36,
// SPEC §11.1, §11.3). Pure functions, so every rule is unit-tested.
// Imported by server.ts under Node type stripping: relative imports only.
import net from "node:net";
import type { AppConfig } from "../config.ts";

export interface NetworkInterfaceInfo {
  address: string;
  family: string | number;
  internal: boolean;
}

const LOOPBACK_NAMES = ["127.0.0.1", "localhost", "[::1]"];

export function isLoopback(address: string): boolean {
  const a = stripMapped(address);
  return a === "::1" || (net.isIPv4(a) && a.startsWith("127."));
}

/** `::ffff:192.168.1.5` (IPv4 seen through an IPv6 socket) → `192.168.1.5`. */
export function stripMapped(address: string): string {
  return address.toLowerCase().startsWith("::ffff:") && net.isIPv4(address.slice(7))
    ? address.slice(7)
    : address;
}

/** The IPv4 addresses other computers can use to reach this one. */
export function lanAddresses(
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined>,
): string[] {
  const found = new Set<string>();
  for (const list of Object.values(interfaces)) {
    for (const i of list ?? []) {
      const ipv4 = i.family === "IPv4" || i.family === 4;
      // 169.254.x.x is a link-local fallback, never a usable LAN address.
      if (ipv4 && !i.internal && !i.address.startsWith("169.254.")) found.add(i.address);
    }
  }
  return [...found].sort();
}

/**
 * Host header values DRAFTEX answers to. Anything else is refused, so a web
 * page that points its own name at 127.0.0.1 (DNS rebinding) cannot reach the app.
 */
export function allowedHosts(
  config: Pick<AppConfig, "mode" | "port" | "hostNames">,
  machine: { lanAddresses: string[]; hostname: string },
): Set<string> {
  const hosts = new Set<string>();
  if (config.mode === "server") {
    // The proxy forwards the public name, with or without a port.
    for (const n of config.hostNames) hosts.add(n);
    return hosts;
  }
  const names = [...LOOPBACK_NAMES];
  if (config.mode === "lan") {
    const h = machine.hostname.toLowerCase();
    names.push(...machine.lanAddresses, h, `${h}.local`, ...config.hostNames);
  }
  for (const n of names) hosts.add(`${n}:${config.port}`);
  return hosts;
}

/** The client's address. In server mode a trusted proxy may name it in x-forwarded-for. */
export function clientAddressOf(
  socketAddress: string,
  forwardedFor: string | undefined,
  config: Pick<AppConfig, "mode" | "trustedProxies">,
): string {
  const socket = stripMapped(socketAddress);
  if (config.mode !== "server" || !forwardedFor) return socket;
  const trusted = new Set(config.trustedProxies.map(stripMapped));
  if (!trusted.has(socket)) return socket;
  // Walk from the nearest hop; the first address that is not one of our proxies is the client.
  const hops = forwardedFor
    .split(",")
    .map((s) => stripMapped(s.trim()))
    .filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i]!;
    if (net.isIP(hop) === 0) return socket;
    if (!trusted.has(hop)) return hop;
  }
  return hops[0] ?? socket;
}

export interface GuardInput {
  method: string;
  host: string | undefined;
  origin: string | undefined;
  socketAddress: string;
  forwardedFor: string | undefined;
  forwardedProto: string | undefined;
}

export type GuardResult =
  { ok: true; clientAddress: string } | { ok: false; status: 400 | 403 | 421; message: string };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const WRONG_HOST =
  "DRAFTEX does not answer to this address. Open it with the address shown on the Network page.";
export const CROSS_SITE =
  "This request did not come from a DRAFTEX page, so it was refused. Reload the page and try again.";
export const NEEDS_HTTPS =
  "DRAFTEX runs in server mode and only accepts requests through its HTTPS address.";

export function guardRequest(
  input: GuardInput,
  config: Pick<AppConfig, "mode" | "trustedProxies">,
  hosts: Set<string>,
): GuardResult {
  const socket = stripMapped(input.socketAddress);
  const host = input.host?.toLowerCase();
  if (!host || !hosts.has(host)) return { ok: false, status: 421, message: WRONG_HOST };

  let scheme = "http";
  if (config.mode === "server") {
    const fromProxy = config.trustedProxies.map(stripMapped).includes(socket);
    const proto = input.forwardedProto?.split(",")[0]?.trim().toLowerCase();
    if (!fromProxy || proto !== "https") return { ok: false, status: 403, message: NEEDS_HTTPS };
    scheme = "https";
  }

  if (!SAFE_METHODS.has(input.method.toUpperCase())) {
    // Browsers send Origin on every POST, PUT, PATCH and DELETE; its absence means a script or a forgery.
    if (!input.origin) return { ok: false, status: 403, message: CROSS_SITE };
    let origin: URL;
    try {
      origin = new URL(input.origin);
    } catch {
      return { ok: false, status: 403, message: CROSS_SITE };
    }
    if (origin.host !== host || origin.protocol !== `${scheme}:`) {
      return { ok: false, status: 403, message: CROSS_SITE };
    }
  }

  return { ok: true, clientAddress: clientAddressOf(socket, input.forwardedFor, config) };
}
