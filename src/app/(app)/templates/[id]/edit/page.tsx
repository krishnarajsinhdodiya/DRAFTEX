import { notFound } from "next/navigation";
import { actorOf } from "@/lib/auth/service";
import { NotFoundError, getData } from "@/lib/data";
import { storedFields } from "@/lib/data/templates";
import { templateAccess } from "@/lib/templates/permissions";
import { requireUser } from "@/server/auth";
import { Builder } from "./builder";

/** Only the owner edits in place; for everyone else (and built-ins) the page does not exist. */
export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const actor = actorOf(user);
  const { id } = await params;
  const data = await getData();
  let row;
  try {
    row = await data.templates.get(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  if (!templateAccess(row, actor).edit) notFound();
  return <Builder id={row.id} initial={storedFields(row)} initialVersion={row.version} />;
}
