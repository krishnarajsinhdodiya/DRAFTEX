"use server";
// Blueprint server actions. Next.js checks the Origin of every server action
// (the CSRF guard); the work happens in blueprint-commands.
import { revalidatePath } from "next/cache";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { requireUser } from "./auth";
import { blueprintCommands } from "./blueprint-commands";

async function commands() {
  const { user } = await requireUser();
  return blueprintCommands(await getData(), actorOf(user));
}

export async function saveBlueprintAction(id: string | null, version: number, fields: unknown) {
  const r = await (await commands()).save(id, version, fields);
  if (r.ok) revalidatePath("/blueprints");
  return r;
}

export async function setBlueprintSharingAction(id: string, shared: boolean) {
  const r = await (await commands()).setSharing(id, shared);
  if (r.ok) revalidatePath("/blueprints");
  return r;
}

export async function deleteBlueprintAction(id: string) {
  const r = await (await commands()).remove(id);
  if (r.ok) revalidatePath("/blueprints");
  return r;
}
