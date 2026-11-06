import type { Metadata } from "next";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { z } from "zod";
import { AutoSelect } from "@/components/auto-select";
import { buttonStyles, inputStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { PaperStatus } from "@/generated/prisma/enums";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { EXAM_GROUPS, EXAM_GROUP_KEYS, PAPER_STATUS_LABEL } from "@/lib/templates/labels";
import { requireUser } from "@/server/auth";
import { PaperList } from "./paper-list";
import { TrashedNotice } from "./trash-buttons";

export const metadata: Metadata = { title: "Papers · DRAFTEX" };

// Search and filters live in the address (D59): they work without scripts,
// and Back returns to the same list. Anything unknown is ignored.
const filterSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  group: z.enum(EXAM_GROUP_KEYS).optional().catch(undefined),
  year: z.string().max(20).optional().catch(undefined),
  status: z.enum(PaperStatus).optional().catch(undefined),
  course: z.string().max(40).optional().catch(undefined),
  trashed: z.string().max(64).optional().catch(undefined),
});

const selectClass = `${inputStyles} text-small`;

export default async function PapersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const f = filterSchema.parse(await searchParams);
  const data = await getData();
  const actor = actorOf(user);
  const filter = {
    q: f.q?.trim() || undefined,
    group: f.group,
    year: f.year || undefined,
    status: f.status,
    course: f.course || undefined,
  };
  const filtered = Object.values(filter).some(Boolean);
  const [rows, trash, options, any] = await Promise.all([
    data.papers.list(actor, filter),
    data.papers.listTrash(actor),
    data.papers.filterOptions(actor),
    filtered ? data.papers.recent(actor, 1) : null,
  ]);
  const hasPapers = filtered ? (any?.length ?? 0) > 0 : rows.length > 0;
  const justTrashed = f.trashed ? trash.find((p) => p.id === f.trashed) : undefined;
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
      {hasPapers ? (
        <>
          <form
            // Remount on each filter change so the fields show the filters in the address.
            key={JSON.stringify(filter)}
            role="search"
            aria-label="Find papers"
            className="flex flex-wrap items-end gap-2"
            action="/papers"
          >
            <label className="flex min-w-56 flex-[2] flex-col gap-1 text-small font-medium">
              Search
              <input
                type="search"
                name="q"
                defaultValue={filter.q}
                maxLength={100}
                placeholder="Title, course code or course title"
                className={`${selectClass} w-full px-3`}
              />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium">
              Exam
              <AutoSelect name="group" defaultValue={filter.group ?? ""} className={selectClass}>
                <option value="">Any</option>
                {EXAM_GROUP_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {EXAM_GROUPS[k].label}
                  </option>
                ))}
              </AutoSelect>
            </label>
            <label className="flex flex-col gap-1 text-small font-medium">
              Year
              <AutoSelect name="year" defaultValue={filter.year ?? ""} className={selectClass}>
                <option value="">Any</option>
                {options.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </AutoSelect>
            </label>
            <label className="flex flex-col gap-1 text-small font-medium">
              Status
              <AutoSelect name="status" defaultValue={filter.status ?? ""} className={selectClass}>
                <option value="">Any</option>
                {Object.entries(PAPER_STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </AutoSelect>
            </label>
            <label className="flex max-w-full min-w-0 flex-col gap-1 text-small font-medium">
              Course
              <AutoSelect
                name="course"
                defaultValue={filter.course ?? ""}
                className={`${selectClass} max-w-64`}
              >
                <option value="">Any</option>
                {options.courses.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.title ? `${c.code} · ${c.title}` : c.code}
                  </option>
                ))}
              </AutoSelect>
            </label>
            <button type="submit" className={`${buttonStyles.secondary} h-9`}>
              Show
            </button>
            {filtered ? (
              <Link href="/papers" className={`${buttonStyles.quiet} h-9`}>
                Clear
              </Link>
            ) : null}
          </form>
          <p className="-mt-2 text-small text-ink-2" aria-live="polite">
            {rows.length === 1 ? "1 paper" : `${rows.length} papers`}
            {filtered ? " match" : ""}, most recently changed first
          </p>
        </>
      ) : null}
      {rows.length === 0 ? (
        <div className={`${sheetStyles} px-6 py-12 text-center`}>
          {filtered ? (
            <>
              <p className="font-medium">No papers match.</p>
              <p className="mt-1 text-small text-ink-2">
                Try fewer words, or{" "}
                <Link href="/papers" className="text-accent underline underline-offset-2">
                  show every paper
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">You have no papers yet.</p>
              <p className="mt-1 text-small text-ink-2">
                Open a template and choose New paper. The paper keeps its own copy of the template.
              </p>
            </>
          )}
        </div>
      ) : (
        <PaperList rows={rows} />
      )}
    </div>
  );
}
