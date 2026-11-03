// Re-sends the session cookie on page loads so its 7-day lifetime slides
// with use. The database decides whether a session is valid; this only
// keeps an active user's browser from dropping the cookie early.
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, networkMode, sessionCookieOptions } from "@/server/cookie";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && request.method === "GET") {
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(networkMode()));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
