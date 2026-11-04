// Session cookie settings. No database imports: the request proxy uses this.
import { SESSION_IDLE_MS } from "@/lib/auth/constants";
import { type NetworkMode, readConfig } from "@/lib/config";
import { runningFrom } from "@/lib/net/runtime";
import { dataPaths, getDataDir } from "@/lib/paths";

export const SESSION_COOKIE = "draftex_session";

/** The mode the server is running in; config.json may already hold the next one (D36). */
export function networkMode(): NetworkMode {
  return runningFrom(process.env)?.mode ?? readConfig(dataPaths(getDataDir()).config).mode;
}

/** httpOnly + SameSite=Lax always; Secure in server mode (SPEC §11.3). */
export function sessionCookieOptions(mode: NetworkMode) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: mode === "server",
    path: "/",
    maxAge: Math.floor(SESSION_IDLE_MS / 1000),
  };
}
