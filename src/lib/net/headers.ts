// Security headers (SPEC §11.6, D41). The custom server sets the fixed ones
// on every response; the request proxy sets the CSP with a fresh nonce.
// Imported by server.ts under Node type stripping: relative imports only.
import type { NetworkMode } from "../config.ts";

/** Headers on every response, static files included. */
export function securityHeaders(mode: NetworkMode): Record<string, string> {
  return {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
    ...(mode === "server" && { "Strict-Transport-Security": "max-age=31536000" }),
  };
}

/**
 * Content Security Policy for one response.
 * - Scripts: only this app's, through a per-request nonce ('strict-dynamic'
 *   lets Next's own chunks load). No eval outside development.
 * - Documented exception (D41): style-src allows inline styles, because
 *   MathLive injects <style> elements and React renders style attributes.
 * - Workers and images may be blob: URLs (pdf.js, image previews).
 */
export function contentSecurityPolicy(
  nonce: string,
  opts: { mode: NetworkMode; dev: boolean },
): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src 'self'${opts.dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "media-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (opts.mode === "server") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** 128 random bits, base64. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
