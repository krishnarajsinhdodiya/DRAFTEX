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

/** A template the checker rejects (SPEC §7 level 1). Routes answer 422 and list the issues. */
export class InvalidTemplateError extends Error {
  override name = "InvalidTemplateError";
  readonly issues: { code: string; message: string; path?: string }[];
  constructor(issues: { code: string; message: string; path?: string }[]) {
    super(issues.map((i) => i.message).join(" "));
    this.issues = issues;
  }
}

/** A bank question the rules refuse (D72, D77): routes answer 422 and list the problems. */
export class InvalidQuestionError extends Error {
  override name = "InvalidQuestionError";
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join(" "));
    this.problems = problems;
  }
}
