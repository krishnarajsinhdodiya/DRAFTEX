import type { Metadata } from "next";
import Link from "next/link";
import { pageTitleStyles, sheetStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { TRASH_DAYS } from "@/lib/data/papers";
import { EXAM_KIND_LABEL } from "@/lib/templates/labels";
import { requireUser } from "@/server/auth";
import { EmptyTrashButton, PurgeButton, RestoreButton } from "../trash-buttons";

export const metadata: Metadata = { title: "Trash · DRAFTEX" };

const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function TrashPage() {
  const { user } = await requireUser();
  const rows = await (await getData()).papers.listTrash(actorOf(user));
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Link
        href="/papers"
        className="self-start rounded-sm text-small text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        ← Papers
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={pageTitleStyles}>Trash</h1>
        {rows.length > 0 ? <EmptyTrashButton count={rows.length} /> : null}
      </div>
      <p className="text-small text-ink-2">
        Deleted papers stay here for {TRASH_DAYS} days, then they are deleted for good. Only you see
        your Trash.
      </p>
      {rows.length === 0 ? (
        <div className={`${sheetStyles} px-6 py-12 text-center`}>
          <p className="font-medium">Trash is empty.</p>
        </div>
      ) : (
        <ul className={`${sheetStyles} divide-y divide-rule overflow-hidden`}>
          {rows.map((p) => {
            const left = p.daysLeft;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-paper text-lead font-semibold break-words [overflow-wrap:anywhere]">
                    {p.title}
                  </span>
                  <span className="text-small text-ink-2 break-words">
                    {[p.courseCode, EXAM_KIND_LABEL[p.examKind]].filter(Boolean).join(" · ")} ·
                    deleted {day.format(p.deletedAt)} ·{" "}
                    {left === 1 ? "1 day left" : `${left} days left`}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <RestoreButton id={p.id} title={p.title} />
                  <PurgeButton id={p.id} title={p.title} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
