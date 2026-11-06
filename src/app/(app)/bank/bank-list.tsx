// One list of bank questions, used by the Bank page; the editor's picker
// shows the same facts in its own rows.
import Link from "next/link";
import { Badge } from "@/components/badge";
import { sheetStyles } from "@/components/styles";
import { BLOOM_LABEL, type Bloom } from "@/lib/paper/bloom";
import { GROUP_TYPE_LABEL, marksText } from "@/lib/templates/labels";
import type { BankType } from "@/lib/bank/question";

const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export interface BankRow {
  id: string;
  searchText: string | null;
  courseCode: string | null;
  coTag: string | null;
  bloomLevel: Bloom | null;
  marks: number | null;
  type: string | null;
  unit: number | null;
  sharing: "PRIVATE" | "SHARED";
  mine: boolean;
  ownerName: string;
  tags: string[];
  lastUse: { paperTitle: string; usedAt: Date } | null;
}

/** "Q text…": the first line of the question, for lists. */
export function firstLine(text: string | null, max = 160): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s || "(picture only)";
}

/** The facts line shared by the list and the picker. */
export function facts(q: BankRow): string {
  return [
    q.courseCode,
    q.unit ? `Unit ${q.unit}` : null,
    q.coTag,
    q.bloomLevel ? BLOOM_LABEL[q.bloomLevel] : null,
    q.type ? GROUP_TYPE_LABEL[q.type as BankType] : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function LastUse({ use }: { use: BankRow["lastUse"] }) {
  return (
    <span className="text-caption text-ink-3 break-words [overflow-wrap:anywhere]">
      {use ? `Last used in ${use.paperTitle}, ${day.format(use.usedAt)}` : "Not used by you yet"}
    </span>
  );
}

export function BankList({ rows }: { rows: BankRow[] }) {
  return (
    <ul className={`${sheetStyles} divide-y divide-rule overflow-hidden`}>
      {rows.map((q) => (
        <li key={q.id}>
          <Link
            href={`/bank/${q.id}`}
            className="flex items-stretch gap-4 px-5 py-3.5 hover:bg-sunk/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-paper text-body break-words [overflow-wrap:anywhere] text-ink">
                {firstLine(q.searchText)}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2">
                <span className="break-words [overflow-wrap:anywhere]">{facts(q)}</span>
                {q.mine ? (
                  q.sharing === "SHARED" ? (
                    <Badge tone="blue">Shared</Badge>
                  ) : null
                ) : (
                  <Badge tone="blue">From {q.ownerName}</Badge>
                )}
                {q.tags.slice(0, 3).map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </span>
              <LastUse use={q.lastUse} />
            </span>
            {q.marks !== null ? (
              <span className="dx-margin hidden w-24 shrink-0 flex-col justify-center text-body sm:flex">
                <span className="font-semibold text-ink">
                  {marksText(q.marks)} {q.marks === 1 ? "mark" : "marks"}
                </span>
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
