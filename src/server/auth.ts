// Next.js glue for src/lib/auth: the session cookie, the signed-in user for
// this request, and guards for pages and server actions.
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { type Auth, type ValidSession, createAuth } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { SESSION_COOKIE, networkMode, sessionCookieOptions } from "./cookie";

const globalForAuth = globalThis as unknown as { draftexAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  globalForAuth.draftexAuth ??= getData().then((data) => createAuth({ data, mode: networkMode }));
  return globalForAuth.draftexAuth;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(networkMode()));
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/**
 * Client address for rate limits and lockouts. The custom server (server.ts,
 * D36) replaces any client-sent x-forwarded-for with the socket address, or
 * in server mode with the address its trusted proxy reported.
 */
export async function clientAddress(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** The signed-in session for this request, or null. Cached per request. */
export const getSession = cache(async (): Promise<ValidSession | null> => {
  return (await getAuth()).validateSession(await sessionToken());
});

/** Any signed-in session, even one that must change its password first. */
export async function requireSession(): Promise<ValidSession> {
  const s = await getSession();
  if (s) return s;
  if (await (await getAuth()).needsSetup()) redirect("/setup");
  redirect("/login");
}

/** A signed-in user who may use the app. */
export async function requireUser(): Promise<ValidSession> {
  const s = await requireSession();
  if (s.user.mustChangePassword) redirect("/change-password");
  return s;
}

/** Admin pages are "not found" for everyone else. */
export async function requireAdmin(): Promise<ValidSession> {
  const s = await requireUser();
  if (s.user.role !== "ADMIN") notFound();
  return s;
}
