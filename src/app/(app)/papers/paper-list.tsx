// One list of papers, used by the Papers page and the home screen's Recent papers.
import Link from "next/link";
import { Badge } from "@/components/badge";
import { sheetStyles } from "@/components/styles";
import type { ExamKind, PaperStatus } from "@/generated/prisma/enums";
import { paperSnapshotSchema } from "@/lib/paper/snapshot";
import { EXAM_KIND_LABEL, durationText, marksText } from "@/lib/templates/labels";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export interface PaperRow {
  id: string;
  title: string;
  courseCode: string;
  courseTitle: string;
  examKind: ExamKind;
  academicYear: string;
  status: PaperStatus;
  printedAt: Date | null;
  updatedAt: Date;
  templateSnapshot: unknown;
}

export function StatusBadge({
  status,
  printedAt,
}: {
  status: PaperStatus;
  printedAt: Date | null;
}) {
  if (status === "PRINTED") {
    return <Badge tone="green">Printed{printedAt ? ` ${day.format(printedAt)}` : ""}</Badge>;
  }
  if (status === "FINAL") return <Badge tone="green">Final</Badge>;
  return <Badge>Draft</Badge>;
}

export function PaperList({ rows, compact = false }: { rows: PaperRow[]; compact?: boolean }) {
  return (
    <ul className={`${sheetStyles} divide-y divide-rule overflow-hidden`}>
      {rows.map((p) => {
        const s = paperSnapshotSchema.safeParse(p.templateSnapshot);
        return (
          <li key={p.id}>
            <Link
              href={`/papers/${p.id}`}
              className={
                "flex items-stretch gap-4 px-5 hover:bg-sunk/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent " +
                (compact ? "py-2.5" : "py-3.5")
              }
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-paper text-lead font-semibold break-words [overflow-wrap:anywhere]">
                    {p.title}
                  </span>
                  <StatusBadge status={p.status} printedAt={p.printedAt} />
                </span>
                <span className="text-small text-ink-2 break-words [overflow-wrap:anywhere]">
                  {[p.courseCode, p.courseTitle].filter(Boolean).join(" · ") || "No course"} ·{" "}
                  {EXAM_KIND_LABEL[p.examKind]}
                  {p.academicYear ? ` · ${p.academicYear}` : ""} · changed{" "}
                  {when.format(p.updatedAt)}
                </span>
              </span>
              {s.success && !compact ? (
                <span className="dx-margin hidden w-36 shrink-0 flex-col justify-center text-body sm:flex">
                  <span className="font-semibold text-ink">{marksText(s.data.maxMarks)} marks</span>
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
  );
}
