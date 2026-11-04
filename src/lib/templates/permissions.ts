// Which template actions to offer (SPEC §7 permission table). The data layer
// enforces the same rules; this only decides which buttons to show.
import type { Role, Visibility } from "@/generated/prisma/enums";

export interface TemplateAccess {
  edit: boolean;
  copy: boolean;
  publish: boolean;
  unpublish: boolean;
  remove: boolean;
}

export function templateAccess(
  t: { ownerId: string; builtIn: boolean; visibility: Visibility; seedKey?: string | null },
  actor: { userId: string; role: Role },
): TemplateAccess {
  const owner = t.ownerId === actor.userId;
  const admin = actor.role === "ADMIN";
  // Built-ins stay locked, except that an administrator may delete one (D50);
  // the blank one is what New template copies, so it stays.
  if (t.builtIn)
    return {
      edit: false,
      copy: true,
      publish: false,
      unpublish: false,
      remove: admin && t.seedKey !== "blank",
    };
  return {
    edit: owner,
    copy: true,
    publish: owner && t.visibility === "PRIVATE",
    unpublish: (owner || admin) && t.visibility === "GLOBAL",
    remove: owner || admin,
  };
}
