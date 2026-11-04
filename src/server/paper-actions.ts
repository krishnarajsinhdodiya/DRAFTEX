"use server";
// Paper server actions. Next.js checks the Origin of every server action
// (the CSRF guard); the work happens in paper-commands.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { requireUser } from "./auth";
import { paperCommands } from "./paper-commands";
import type { CommandResult } from "./template-commands";

async function commands() {
  const { user } = await requireUser();
  return paperCommands(await getData(), actorOf(user));
}

/** Starts a paper from a template and opens it in the editor. */
export async function createPaperAction(
  templateId: string,
  input: unknown,
): Promise<CommandResult<string>> {
  const r = await (await commands()).create(templateId, input);
  if (!r.ok) return r;
  revalidatePath("/papers");
  redirect(`/papers/${r.value}`);
}

export async function updatePaperDetailsAction(
  id: string,
  version: number,
  patch: unknown,
): Promise<CommandResult<number>> {
  const r = await (await commands()).updateDetails(id, version, patch);
  if (r.ok) revalidatePath("/papers");
  return r;
}

export async function saveSlotAction(id: string, input: unknown): Promise<CommandResult<string>> {
  return (await commands()).saveSlot(id, input);
}

/** Copies the paper (e.g. into its ATKT version) and opens the copy. */
export async function duplicatePaperAction(
  id: string,
  input: unknown,
): Promise<CommandResult<string>> {
  const r = await (await commands()).duplicate(id, input);
  if (!r.ok) return r;
  revalidatePath("/papers");
  redirect(`/papers/${r.value}`);
}

export async function clearSlotAction(id: string, place: unknown): Promise<CommandResult> {
  return (await commands()).clearSlot(id, place);
}

export async function moveSlotAction(
  id: string,
  from: unknown,
  to: unknown,
): Promise<CommandResult> {
  return (await commands()).moveSlot(id, from, to);
}

export async function duplicateSlotAction(
  id: string,
  place: unknown,
): Promise<CommandResult<{ groupKey: string; position: number }>> {
  return (await commands()).duplicateSlot(id, place);
}

/** Moves a paper to Trash (D51) and goes back to the list, which offers Undo. */
export async function deletePaperAction(id: string): Promise<CommandResult> {
  const r = await (await commands()).remove(id);
  if (!r.ok) return r;
  revalidatePath("/papers");
  redirect(`/papers?trashed=${encodeURIComponent(id)}`);
}

export async function restorePaperAction(id: string): Promise<CommandResult> {
  const r = await (await commands()).restore(id);
  if (r.ok) revalidatePath("/papers");
  return r;
}

export async function purgePaperAction(id: string): Promise<CommandResult> {
  const r = await (await commands()).purge(id);
  if (r.ok) revalidatePath("/papers/trash");
  return r;
}

export async function emptyTrashAction(): Promise<CommandResult<number>> {
  const r = await (await commands()).emptyTrash();
  if (r.ok) revalidatePath("/papers/trash");
  return r;
}
