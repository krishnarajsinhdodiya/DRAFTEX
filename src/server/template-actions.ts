"use server";
// Template server actions. Next.js checks the Origin of every server action,
// which is the CSRF guard here; the work happens in template-commands.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { requireUser } from "./auth";
import { type CommandResult, templateCommands } from "./template-commands";

async function commands() {
  const { user } = await requireUser();
  return templateCommands(await getData(), actorOf(user));
}

/** Copies a template the user can see and opens the copy in the builder. */
export async function copyTemplateAction(
  id: string,
  title?: string,
): Promise<CommandResult<string>> {
  const r = await (await commands()).copy(id, title);
  if (!r.ok) return r;
  revalidatePath("/templates");
  redirect(`/templates/${r.value}/edit`);
}

export async function saveTemplateAction(
  id: string,
  version: number,
  fields: unknown,
): Promise<CommandResult<number>> {
  const r = await (await commands()).save(id, version, fields);
  if (r.ok) revalidatePath("/templates");
  return r;
}

export async function setTemplateVisibilityAction(
  id: string,
  visibility: "PRIVATE" | "GLOBAL",
): Promise<CommandResult> {
  const r = await (await commands()).setVisibility(id, visibility);
  if (r.ok) revalidatePath("/templates");
  return r;
}

export async function deleteTemplateAction(id: string): Promise<CommandResult> {
  const r = await (await commands()).remove(id);
  if (!r.ok) return r;
  revalidatePath("/templates");
  redirect("/templates?deleted=1");
}
