// The one data-access layer (SPEC §11.4). Routes, pages and actions use this,
// never Prisma directly; ESLint blocks the Prisma client everywhere else.
import { type Db, getDb } from "@/lib/db/client";
import { assets } from "./assets";
import { bpharmCatalogue } from "@/lib/catalogue";
import { auditLog } from "./audit";
import { authStore } from "./auth-store";
import { courses, syncCatalogue } from "./courses";
import { papers } from "./papers";
import { BUILT_IN_TEMPLATES } from "@/lib/templates/seeds";
import { syncBuiltInTemplates, templates } from "./templates";
import { users } from "./users";

export type { Actor } from "./actor";
export type { CourseFilter, SyncResult } from "./courses";
export type { SeedSyncResult, TemplateFilter, TemplateScope } from "./templates";
export { ConflictError, ForbiddenError, InvalidTemplateError, NotFoundError } from "./errors";
export type { Role } from "@/generated/prisma/enums";

export function dataLayer(db: Db) {
  return {
    templates: templates(db),
    papers: papers(db),
    assets: assets(db),
    users: users(db),
    auth: authStore(db),
    courses: courses(db),
    /** Records what was done outside the other tables (backups, network); the Activity screen reads it. */
    audit: auditLog(db),
    /** Startup and maintenance only; never call these on behalf of a user. */
    system: {
      syncCatalogue: () => syncCatalogue(db, bpharmCatalogue()),
      syncBuiltInTemplates: () => syncBuiltInTemplates(db, BUILT_IN_TEMPLATES),
    },
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
