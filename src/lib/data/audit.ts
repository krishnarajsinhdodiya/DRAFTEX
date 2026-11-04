import type { Db } from "@/lib/db/client";
import { type Actor, requireAdmin } from "./actor";

/** Audit entries name what happened to which record; never question text or passwords. */
export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  /** Short, non-confidential context: a client address, a network mode. */
  detail?: string | null;
}

type AuditDb = Pick<Db, "auditLog">;

export async function writeAudit(db: AuditDb, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      detail: entry.detail ?? null,
    },
  });
}

export interface AuditQuery {
  /** 1-based. */
  page?: number;
  pageSize?: number;
  action?: string;
  actorId?: string;
}

export const AUDIT_PAGE_SIZE = 50;

/** The Activity screen (SPEC §13 Phase 7): administrators only, newest first. */
export function auditLog(db: Db) {
  return {
    record: (entry: AuditEntry) => writeAudit(db, entry),

    async list(actor: Actor, q: AuditQuery = {}) {
      requireAdmin(actor);
      const pageSize = Math.min(Math.max(q.pageSize ?? AUDIT_PAGE_SIZE, 1), 200);
      const where = {
        ...(q.action && { action: q.action }),
        ...(q.actorId && { actorId: q.actorId }),
      };
      const total = await db.auditLog.count({ where });
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(Math.max(Math.trunc(q.page ?? 1) || 1, 1), pages);
      const rows = await db.auditLog.findMany({
        where,
        orderBy: [{ at: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          detail: true,
          at: true,
          actor: { select: { id: true, name: true } },
        },
      });
      return { rows, total, page, pages };
    },

    /** Every action that appears in the log, for the filter. */
    async actions(actor: Actor): Promise<string[]> {
      requireAdmin(actor);
      const rows = await db.auditLog.findMany({
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
      });
      return rows.map((r) => r.action);
    },
  };
}
