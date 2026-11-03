import type { Db } from "@/lib/db/client";

/** Audit entries name what happened to which record; never question text or passwords. */
export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
}

type AuditDb = Pick<Db, "auditLog">;

export async function writeAudit(db: AuditDb, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
    },
  });
}
