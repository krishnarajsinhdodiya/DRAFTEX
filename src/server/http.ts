// Helpers for route handlers. Server actions get Next's Origin check for
// free; route handlers do not, so every mutation or compile route calls
// sameOrigin itself (SPEC §11.3, D19).
import { NextResponse } from "next/server";
import { type Actor } from "@/lib/data";
import { actorOf } from "@/lib/auth/service";
import { getSession } from "./auth";

/** True when the request says it comes from this app's own pages. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function jsonError(status: number, message: string, details?: string[]): NextResponse {
  return NextResponse.json({ message, ...(details?.length && { details }) }, { status });
}

/** The signed-in actor, or the response to send instead. */
export async function apiActor(): Promise<Actor | NextResponse> {
  const s = await getSession();
  if (!s) return jsonError(401, "Sign in again to continue.");
  if (s.user.mustChangePassword) return jsonError(403, "Choose a new password first.");
  return actorOf(s.user);
}

export function pdfResponse(pdf: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
