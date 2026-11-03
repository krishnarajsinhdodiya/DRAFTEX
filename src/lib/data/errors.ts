// Errors the data layer throws. Routes map them to HTTP codes:
// NotFound → 404 (also for records the actor may not see, so IDs leak nothing),
// Forbidden → 403 (record is visible but the action is not allowed),
// Conflict → 409 (stale version or a rule such as "keep one admin").
export class NotFoundError extends Error {
  override name = "NotFoundError";
  constructor(what: string) {
    super(`${what} was not found.`);
  }
}

export class ForbiddenError extends Error {
  override name = "ForbiddenError";
}

export class ConflictError extends Error {
  override name = "ConflictError";
}

export const STALE_VERSION =
  "Someone saved this in another window after you opened it. Reload to see the latest version, then make your change again.";
