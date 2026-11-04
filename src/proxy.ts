// Runs before every page and route handler:
// - sets the Content Security Policy with a fresh script nonce, which Next.js
//   reads from the request headers and puts on its own scripts (SPEC §11.6, D41);
// - re-sends the session cookie on page loads so its 7-day lifetime slides
//   with use. The database decides whether a session is valid; this only
//   keeps an active user's browser from dropping the cookie early.
import { type NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy, newNonce } from "@/lib/net/headers";
import { SESSION_COOKIE, networkMode, sessionCookieOptions } from "@/server/cookie";

export function proxy(request: NextRequest) {
  const mode = networkMode();
  const csp = contentSecurityPolicy(newNonce(), {
    mode,
    dev: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && request.method === "GET") {
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(mode));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
