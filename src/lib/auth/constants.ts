// Session timing, kept free of imports so the request proxy can use it.
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** SPEC §11.3: sessions end after 7 idle days. */
export const SESSION_IDLE_MS = 7 * DAY;
/** The expiry moves forward at most once an hour, not on every request. */
export const SESSION_RENEW_AFTER_MS = 60 * MINUTE;
