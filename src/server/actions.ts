"use server";
// Form actions. Next.js checks the Origin of every server action against the
// host, which is the CSRF guard for these mutations (SPEC §11.3).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { actorOf } from "@/lib/auth/service";
import { ConflictError, ForbiddenError, NotFoundError, getData } from "@/lib/data";
import { Role } from "@/generated/prisma/enums";
import {
  clearSessionCookie,
  clientAddress,
  getAuth,
  requireAdmin,
  requireSession,
  sessionToken,
  setSessionCookie,
} from "./auth";
import type { FormState } from "./form-state";

function text(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

/** Values to put back in the form after an error. Never passwords. */
function keep(fd: FormData, ...names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, text(fd, n)]));
}

function minutes(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m === 1 ? "1 minute" : `${m} minutes`;
}

/** Turns expected failures into form messages; anything else is a real error and propagates. */
function failure(e: unknown, values: Record<string, string> = {}): FormState {
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = String(issue.path[0] ?? "form");
      fields[key] ??= issue.message;
    }
    return { fields, values };
  }
  if (e instanceof ConflictError || e instanceof ForbiddenError || e instanceof NotFoundError) {
    return { error: e.message, values };
  }
  throw e;
}

function mismatch(
  fd: FormData,
  a: string,
  b: string,
  values: Record<string, string>,
): FormState | null {
  return text(fd, a) === text(fd, b)
    ? null
    : { fields: { [b]: "The two passwords are different." }, values };
}

// ---------- sign-in, setup, sign-out ----------

export async function setupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = keep(fd, "name", "email");
  const bad = mismatch(fd, "password", "confirm", values);
  if (bad) return bad;
  try {
    const auth = await getAuth();
    const s = await auth.setupAdmin({
      name: text(fd, "name"),
      email: text(fd, "email"),
      password: text(fd, "password"),
    });
    await setSessionCookie(s.token);
    // The built-ins belong to the first administrator, who exists from now on.
    await (await getData()).system.syncBuiltInTemplates();
  } catch (e) {
    return failure(e, values);
  }
  redirect("/");
}

export async function signInAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = keep(fd, "email");
  const auth = await getAuth();
  const r = await auth.signIn(
    { email: text(fd, "email"), password: text(fd, "password") },
    await clientAddress(),
  );
  if (!r.ok) {
    if (r.reason === "locked") {
      return {
        error: `Too many wrong passwords. This account is locked for ${minutes(r.retryAfterMs)}. An administrator can unlock it sooner.`,
        values,
      };
    }
    if (r.reason === "rate-limited") {
      return {
        error: `Too many sign-in attempts from this computer. Try again in ${minutes(r.retryAfterMs)}.`,
        values,
      };
    }
    return { error: "That email and password do not match.", values };
  }
  await setSessionCookie(r.token);
  redirect(r.mustChangePassword ? "/change-password" : "/");
}

export async function signOutAction(): Promise<void> {
  await (await getAuth()).signOut(await sessionToken());
  await clearSessionCookie();
  redirect("/login");
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  const bad = mismatch(fd, "next", "confirm", {});
  if (bad) return bad;
  try {
    const auth = await getAuth();
    const ok = await auth.changePassword(session, text(fd, "current"), text(fd, "next"));
    if (!ok) return { fields: { current: "This is not your current password." } };
  } catch (e) {
    if (e instanceof ZodError)
      return { fields: { next: e.issues[0]?.message ?? "Choose another password." } };
    return failure(e);
  }
  redirect("/?password=changed");
}

export async function redeemInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = keep(fd, "code", "name", "email");
  const bad = mismatch(fd, "password", "confirm", values);
  if (bad) return bad;
  try {
    const auth = await getAuth();
    const r = await auth.redeemInvite(
      text(fd, "code"),
      { name: text(fd, "name"), email: text(fd, "email"), password: text(fd, "password") },
      await clientAddress(),
    );
    if (!r.ok) {
      return {
        error: `Too many attempts from this computer. Try again in ${minutes(r.retryAfterMs)}.`,
        values,
      };
    }
    await setSessionCookie(r.token);
  } catch (e) {
    return failure(e, values);
  }
  redirect("/");
}

// ---------- administration ----------

const roleSchema = z.enum(Role);

export async function createUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  const values = keep(fd, "name", "email", "role");
  try {
    const auth = await getAuth();
    const created = await auth.adminCreateUser(actorOf(user), {
      name: text(fd, "name"),
      email: text(fd, "email"),
      password: text(fd, "password"),
      role: roleSchema.parse(text(fd, "role") || "FACULTY"),
    });
    revalidatePath("/admin/users");
    return {
      notice: `${created.name} can now sign in with ${created.email} and the password you chose. They will be asked to pick their own.`,
    };
  } catch (e) {
    return failure(e, values);
  }
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  try {
    const auth = await getAuth();
    await auth.adminResetPassword(actorOf(user), text(fd, "userId"), text(fd, "password"));
    revalidatePath("/admin/users");
    return { notice: "Password set. They will be asked to choose their own at the next sign-in." };
  } catch (e) {
    return failure(e);
  }
}

/** Activate, deactivate, unlock or change role. Returns a message only on failure. */
export async function userAdminAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  const actor = actorOf(user);
  const userId = text(fd, "userId");
  const data = await getData();
  try {
    switch (text(fd, "op")) {
      case "deactivate":
        await data.users.setActive(actor, userId, false);
        break;
      case "activate":
        await data.users.setActive(actor, userId, true);
        break;
      case "unlock":
        await data.users.unlock(actor, userId);
        break;
      case "make-admin":
        await data.users.setRole(actor, userId, "ADMIN");
        break;
      case "make-faculty":
        await data.users.setRole(actor, userId, "FACULTY");
        break;
      case "advanced-on":
        await data.users.setAdvancedLatex(actor, userId, true);
        break;
      case "advanced-off":
        await data.users.setAdvancedLatex(actor, userId, false);
        break;
      default:
        return { error: "Unknown action." };
    }
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/admin/users");
  return {};
}

export async function createInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  try {
    const auth = await getAuth();
    const role = roleSchema.parse(text(fd, "role") || "FACULTY");
    const { code, expiresAt } = await auth.createInvite(
      actorOf(user),
      role,
      text(fd, "note") || null,
    );
    revalidatePath("/admin/users");
    return { code, expiresAt: expiresAt.toISOString() };
  } catch (e) {
    return failure(e);
  }
}

export async function revokeInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  try {
    await (await getAuth()).revokeInvite(actorOf(user), text(fd, "inviteId"));
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/admin/users");
  return {};
}
