"use server";
// Question bank server actions. Next.js checks the Origin of every server
// action (the CSRF guard); the work happens in bank-commands.
import { revalidatePath } from "next/cache";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { requireUser } from "./auth";
import { bankCommands } from "./bank-commands";

async function commands() {
  const { user } = await requireUser();
  return bankCommands(await getData(), actorOf(user));
}

export async function saveQuestionAction(id: string | null, version: number, fields: unknown) {
  const r = await (await commands()).save(id, version, fields);
  if (r.ok) revalidatePath("/bank");
  return r;
}

export async function setQuestionSharingAction(id: string, shared: boolean) {
  const r = await (await commands()).setSharing(id, shared);
  if (r.ok) revalidatePath("/bank");
  return r;
}

export async function setCourseShareAction(code: string, on: boolean) {
  const r = await (await commands()).setCourseShare(code, on);
  if (r.ok) revalidatePath("/bank");
  return r;
}

export async function copyQuestionAction(id: string) {
  const r = await (await commands()).copy(id);
  if (r.ok) revalidatePath("/bank");
  return r;
}

export async function trashQuestionAction(id: string) {
  const r = await (await commands()).remove(id);
  if (r.ok) revalidatePath("/bank");
  return r;
}

export async function restoreQuestionAction(id: string) {
  const r = await (await commands()).restore(id);
  if (r.ok) revalidatePath("/papers/trash");
  return r;
}

export async function purgeQuestionAction(id: string) {
  const r = await (await commands()).purge(id);
  if (r.ok) revalidatePath("/papers/trash");
  return r;
}

export async function emptyQuestionTrashAction() {
  const r = await (await commands()).emptyTrash();
  if (r.ok) revalidatePath("/papers/trash");
  return r;
}

/** Searches the bank for the editor's picker (D78). */
export async function searchBankAction(filter: unknown) {
  return (await commands()).list(filter);
}

// The two editor actions below do not revalidate: the editor keeps its own
// state (a refresh would remount it and drop the report), and every page
// renders per request anyway.
export async function addToBankAction(paperId: string, place?: unknown) {
  return (await commands()).addFromPaper(paperId, place);
}

export async function insertFromBankAction(questionId: string, paperId: string, place: unknown) {
  return (await commands()).insert(questionId, paperId, place);
}
