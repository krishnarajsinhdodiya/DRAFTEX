import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Trash2 } from "lucide-react";
import { buttonStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { paperSnapshotSchema } from "@/lib/paper/snapshot";
import { EXAM_KIND_LABEL, durationText, marksText } from "@/lib/templates/labels";
import { requireUser } from "@/server/auth";
import { TrashedNotice } from "./trash-buttons";

export const metadata: Metadata = { title: "Papers · DRAFTEX" };

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function PapersPage({
  searchParams,
}: {
  searchParams: Promise<{ trashed?: string }>;
}) {
  const { user } = await requireUser();
  const { trashed } = await searchParams;
  const data = await getData();
  const actor = actorOf(user);
  const [rows, trash] = await Promise.all([data.papers.list(actor), data.papers.listTrash(actor)]);
  const justTrashed = trashed ? trash.find((p) => p.id === trashed) : undefined;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={pageTitleStyles}>Papers</h1>
        <span className="flex flex-wrap items-center gap-2">
          {trash.length > 0 ? (
            <Link href="/papers/trash" className={buttonStyles.quiet}>
              <Trash2 size={15} aria-hidden /> Trash ({trash.length})
            </Link>
          ) : null}
          <Link href="/templates" className={buttonStyles.primary}>
            New paper from a template
          </Link>
        </span>
      </div>
      {justTrashed ? <TrashedNotice id={justTrashed.id} title={justTrashed.title} /> : null}
      {rows.length === 0 ? (
        <div className={`${sheetStyles} px-6 py-12 text-center`}>
          <p className="font-medium">You have no papers yet.</p>
          <p className="mt-1 text-small text-ink-2">
            Open a template and choose New paper. The paper keeps its own copy of the template.
          </p>
        </div>
      ) : (
        <ul className={`${sheetStyles} divide-y divide-rule overflow-hidden`}>
          {rows.map((p) => {
            const s = paperSnapshotSchema.safeParse(p.templateSnapshot);
            return (
              <li key={p.id}>
                <Link
                  href={`/papers/${p.id}`}
                  className="flex items-stretch gap-4 px-5 py-3.5 hover:bg-sunk/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-paper text-lead font-semibold break-words [overflow-wrap:anywhere]">
                        {p.title}
                      </span>
                      {p.status === "FINAL" ? (
                        <Badge tone="green">Final</Badge>
                      ) : (
                        <Badge>Draft</Badge>
                      )}
                    </span>
                    <span className="text-small text-ink-2 break-words">
                      {[p.courseCode, p.courseTitle].filter(Boolean).join(" · ") || "No course"} ·{" "}
                      {EXAM_KIND_LABEL[p.examKind]} · changed {when.format(p.updatedAt)}
                    </span>
                  </span>
                  {s.success ? (
                    <span className="dx-margin hidden w-36 shrink-0 flex-col justify-center text-body sm:flex">
                      <span className="font-semibold text-ink">
                        {marksText(s.data.maxMarks)} marks
                      </span>
                      <span className="text-small whitespace-normal text-ink-2">
                        {durationText(s.data.durationMinutes)}
                      </span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
