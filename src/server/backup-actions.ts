"use server";
// Backups screen actions. Next.js checks the Origin of every server action.
import { revalidatePath } from "next/cache";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { requireAdmin } from "./auth";
import { backupCommands } from "./backup-commands";
import { backupContext } from "./backups";

async function commands() {
  const { user } = await requireAdmin();
  return backupCommands(await getData(), backupContext(), actorOf(user));
}

export async function backupNowAction(): Promise<
  { ok: true; name: string } | { ok: false; message: string }
> {
  try {
    const name = await (await commands()).backupNow();
    revalidatePath("/admin/backups");
    return { ok: true, name };
  } catch (e) {
    // requireAdmin's notFound() is a navigation, not a failure.
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, message: `The backup could not be made: ${(e as Error).message}` };
  }
}

export async function cancelRestoreAction(): Promise<void> {
  await (await commands()).cancel();
  revalidatePath("/admin/backups");
}
