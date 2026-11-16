import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles, linkStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { EXAM_GROUPS } from "@/lib/templates/labels";
import { requireUser } from "@/server/auth";
import { blueprintCommands } from "@/server/blueprint-commands";
import { OwnerBadge } from "../bank/bank-list";

export const metadata: Metadata = { title: "CO blueprints · DRAFTEX" };

export default async function BlueprintsPage() {
  const { user } = await requireUser();
  const rows = await blueprintCommands(await getData(), actorOf(user)).list();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className={pageTitleStyles}>CO blueprints</h1>
          <p className="text-small text-ink-2">
            Target marks per CO for a course and exam group. The paper editor shows how each paper
            compares.
          </p>
        </div>
        <Link href="/blueprints/new" className={buttonStyles.primary}>
          New blueprint
        </Link>
      </div>
      {rows.length ? (
        <ul className={`${sheetStyles} divide-y divide-rule`}>
          {rows.map((b) => (
            <li
              key={b.id}
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3"
            >
              <Link
                href={`/blueprints/${b.id}`}
                className={`${linkStyles} min-w-0 font-medium break-words [overflow-wrap:anywhere]`}
              >
                {b.courseCode} · {EXAM_GROUPS[b.examGroup].label}
              </Link>
              <span className="text-small text-ink-2">
                {b.targets.length} CO{b.targets.length === 1 ? "" : "s"} ·{" "}
                {b.unit === "PERCENT" ? "percent" : "marks"} · ±{b.tolerance}
              </span>
              {b.mine ? (
                b.sharing === "SHARED" ? (
                  <span className="text-caption text-ink-3">Shared with colleagues</span>
                ) : null
              ) : (
                <OwnerBadge name={b.ownerName} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${sheetStyles} p-5 text-small text-ink-2`}>
          No blueprints yet. A blueprint is optional: papers work the same without one.
        </p>
      )}
    </div>
  );
}
