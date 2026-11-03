import type { Role } from "@/generated/prisma/enums";
import { ForbiddenError } from "./errors";

/** The signed-in user a data-layer call acts for. Every scoped function takes one. */
export interface Actor {
  userId: string;
  role: Role;
}

export function requireAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError("Only an administrator can do this.");
}

/** Any signed-in user may read; the actor must still be a real one. */
export function requireSignedIn(actor: Actor): void {
  if (!actor?.userId) throw new ForbiddenError("Sign in first.");
}
