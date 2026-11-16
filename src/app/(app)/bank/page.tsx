import type { Metadata } from "next";
import Link from "next/link";
import { FileUp, Trash2 } from "lucide-react";
import { z } from "zod";
import { AutoSelect } from "@/components/auto-select";
import { buttonStyles, inputStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { BloomLevel } from "@/generated/prisma/enums";
import { actorOf } from "@/lib/auth/service";
import { BANK_TYPES } from "@/lib/bank/question";
import { getData } from "@/lib/data";
import { BLOOM_LABEL } from "@/lib/paper/bloom";
import { GROUP_TYPE_LABEL } from "@/lib/templates/labels";
import { requireUser } from "@/server/auth";
import { bankCommands } from "@/server/bank-commands";
import { BankList } from "./bank-list";
import { CourseShares } from "./course-shares";

export const metadata: Metadata = { title: "Question bank · DRAFTEX" };

// Search and filters live in the address (as D59): they work without
// scripts, and Back returns to the same list. Anything unknown is ignored.
const filterSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  course: z.string().max(40).optional().catch(undefined),
  unit: z.coerce.number().int().min(1).max(20).optional().catch(undefined),
  co: z.string().max(29).optional().catch(undefined),
  bloom: z.enum(BloomLevel).optional().catch(undefined),
  marks: z.coerce.number().positive().max(100).optional().catch(undefined),
  type: z.enum(BANK_TYPES).optional().catch(undefined),
  scope: z.enum(["mine", "shared"]).optional().catch(undefined),
  // Keyset cursors (D130); the data layer treats anything else as the first page.
  after: z.string().max(200).optional().catch(undefined),
  before: z.string().max(200).optional().catch(undefined),
});

const fieldClass = `${inputStyles} w-full text-small sm:w-auto`;
const labelClass = "flex flex-col gap-1 text-small font-medium";

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const raw = await searchParams;
  const f = filterSchema.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v])),
  );
  const data = await getData();
  const actor = actorOf(user);
  const commands = bankCommands(data, actor);
  const filter = {
    q: f.q?.trim() || undefined,
    course: f.course?.trim() || undefined,
    unit: f.unit,
    co: f.co?.trim() || undefined,
    bloom: f.bloom,
    marks: f.marks,
    type: f.type,
    scope: f.scope,
  };
  const filtered = Object.values(filter).some((v) => v !== undefined);
  const [list, courses, trash, shares, myCourses] = await Promise.all([
    data.bank.list(actor, { ...filter, after: f.after, before: f.before }),
    data.bank.filterOptions(actor),
    data.bank.listTrash(actor),
    commands.courseShares(),
    data.bank.ownCourses(actor),
  ]);
  const pageHref = (cursor: { after?: string; before?: string }) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v !== undefined) p.set(k, String(v));
    for (const [k, v] of Object.entries(cursor)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/bank?${s}` : "/bank";
  };
  const paged = list.older !== null || list.newer !== null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={pageTitleStyles}>Question bank</h1>
        <span className="flex flex-wrap items-center gap-2">
          {trash.length > 0 ? (
            <Link href="/papers/trash#questions" className={buttonStyles.quiet}>
              <Trash2 size={15} aria-hidden /> Trash ({trash.length})
            </Link>
          ) : null}
          <Link href="/bank/duplicates" className={buttonStyles.quiet}>
            Possible duplicates
          </Link>
          <Link href="/bank/import" className={buttonStyles.secondary}>
            <FileUp size={16} aria-hidden /> Import CSV
          </Link>
          <Link href="/bank/new" className={buttonStyles.primary}>
            New question
          </Link>
        </span>
      </div>
      <p className="-mt-3 max-w-prose text-small text-ink-2">
        Your questions are private until you share them. Shared questions can be seen and used by
        every colleague on this DRAFTEX; only you can change or delete yours.
      </p>

      <form
        key={JSON.stringify(filter)}
        role="search"
        aria-label="Find questions"
        className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap"
        action="/bank"
      >
        <label className={`${labelClass} col-span-2 sm:min-w-56 sm:flex-[2]`}>
          Search
          <input
            type="search"
            name="q"
            defaultValue={filter.q}
            maxLength={100}
            placeholder="Words in the question or a tag"
            className={`${fieldClass} w-full px-3`}
          />
        </label>
        <label className={`${labelClass} col-span-2 min-w-0 sm:col-span-1`}>
          Course
          <AutoSelect
            name="course"
            defaultValue={filter.course ?? ""}
            className={`${fieldClass} sm:max-w-64`}
          >
            <option value="">Any</option>
            {courses.map((c) => (
              <option key={c.code} value={c.code}>
                {c.title ? `${c.code} · ${c.title}` : c.code}
              </option>
            ))}
          </AutoSelect>
        </label>
        <label className={labelClass}>
          Bloom
          <AutoSelect name="bloom" defaultValue={filter.bloom ?? ""} className={fieldClass}>
            <option value="">Any</option>
            {Object.entries(BLOOM_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </AutoSelect>
        </label>
        <label className={labelClass}>
          Type
          <AutoSelect name="type" defaultValue={filter.type ?? ""} className={fieldClass}>
            <option value="">Any</option>
            {BANK_TYPES.map((t) => (
              <option key={t} value={t}>
                {GROUP_TYPE_LABEL[t]}
              </option>
            ))}
          </AutoSelect>
        </label>
        <label className={labelClass}>
          Whose
          <AutoSelect name="scope" defaultValue={filter.scope ?? ""} className={fieldClass}>
            <option value="">Mine and shared</option>
            <option value="mine">Only mine</option>
            <option value="shared">Shared by colleagues</option>
          </AutoSelect>
        </label>
        <label className={labelClass}>
          CO
          <input
            name="co"
            defaultValue={filter.co}
            maxLength={29}
            placeholder="BP604T.01"
            className={`${fieldClass} sm:w-32`}
          />
        </label>
        <label className={labelClass}>
          Unit
          <input
            name="unit"
            type="number"
            min={1}
            max={20}
            defaultValue={filter.unit}
            className={`${fieldClass} sm:w-20`}
          />
        </label>
        <label className={labelClass}>
          Marks
          <input
            name="marks"
            type="number"
            min={0.5}
            max={100}
            step="any"
            defaultValue={filter.marks}
            className={`${fieldClass} sm:w-20`}
          />
        </label>
        <button type="submit" className={`${buttonStyles.secondary} h-9`}>
          Show
        </button>
        {filtered ? (
          <Link href="/bank" className={`${buttonStyles.quiet} h-9`}>
            Clear
          </Link>
        ) : null}
      </form>

      <p className="-mt-2 text-small text-ink-2" aria-live="polite">
        {paged
          ? `${filtered ? "Matching questions" : "Questions"}, most recently changed first, ${list.pageSize} to a page`
          : `${list.rows.length === 1 ? "1 question" : `${list.rows.length} questions`}${filtered ? " match" : ""}, most recently changed first`}
      </p>

      {list.rows.length === 0 ? (
        <div className={`${sheetStyles} px-6 py-12 text-center`}>
          {filtered ? (
            <>
              <p className="font-medium">No questions match.</p>
              <p className="mt-1 text-small text-ink-2">
                Try fewer filters, or{" "}
                <Link href="/bank" className="text-accent underline underline-offset-2">
                  show every question
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">The bank is empty.</p>
              <p className="mt-1 text-small text-ink-2">
                Write a question here, import a CSV file, or open a paper and choose Add to bank.
              </p>
            </>
          )}
        </div>
      ) : (
        <BankList rows={list.rows} />
      )}

      {paged ? (
        <nav aria-label="Pages" className="flex items-center justify-center gap-2">
          {list.newer ? (
            <Link href={pageHref({ before: list.newer })} className={buttonStyles.secondary}>
              Newer
            </Link>
          ) : null}
          {list.older ? (
            <Link href={pageHref({ after: list.older })} className={buttonStyles.secondary}>
              Older
            </Link>
          ) : null}
        </nav>
      ) : null}

      {myCourses.length > 0 ? (
        <CourseShares
          courses={myCourses.map((c) => ({
            ...c,
            shared: shares.some((s) => s.courseCode === c.code),
          }))}
        />
      ) : null}
    </div>
  );
}
