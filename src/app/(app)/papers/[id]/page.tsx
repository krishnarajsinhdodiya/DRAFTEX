import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { actorOf } from "@/lib/auth/service";
import { NotFoundError, getData } from "@/lib/data";
import { requireUser } from "@/server/auth";
import { paperEditorView } from "@/server/paper-view";
import { PaperEditor } from "./paper-editor";

export const metadata: Metadata = { title: "Paper · DRAFTEX" };

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  let view;
  try {
    view = await paperEditorView(await getData(), actorOf(user), id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  return (
    <PaperEditor
      key={`${view.id}:${view.version}`}
      view={view}
      allowAdvanced={user.allowAdvancedLatex}
    />
  );
}
