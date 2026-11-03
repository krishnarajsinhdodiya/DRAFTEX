// The one data-access layer (SPEC §11.4). Routes, pages and actions use this,
// never Prisma directly; ESLint blocks the Prisma client everywhere else.
import { type Db, getDb } from "@/lib/db/client";
import { assets } from "./assets";
import { authStore } from "./auth-store";
import { papers } from "./papers";
import { templates } from "./templates";
import { users } from "./users";

export type { Actor } from "./actor";
export { ConflictError, ForbiddenError, NotFoundError } from "./errors";
export type { Role } from "@/generated/prisma/enums";

export function dataLayer(db: Db) {
  return {
    templates: templates(db),
    papers: papers(db),
    assets: assets(db),
    users: users(db),
    auth: authStore(db),
  };
}
export type DataLayer = ReturnType<typeof dataLayer>;

/* v8 ignore start -- process-wide instance over the real database */
let cached: Promise<DataLayer> | undefined;
export function getData(): Promise<DataLayer> {
  cached ??= getDb().then(dataLayer);
  return cached;
}
/* v8 ignore stop */
