import Link from "next/link";
import { z } from "zod";
import { Badge, PciBadge } from "@/components/badge";
import { FormAlert, buttonStyles } from "@/components/form";
import { ExamKind, Program } from "@/generated/prisma/enums";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { EXAM_KIND_LABEL, PROGRAM_LABEL } from "@/lib/templates/labels";
import { BUILT_IN_TEMPLATES } from "@/lib/templates/seeds";
import { requireUser } from "@/server/auth";
import { summary } from "@/server/template-view";
import { AutoSelect } from "./auto-select";
import { NewTemplateButton } from "./buttons";

const SCOPES = [
  { value: "ALL", label: "All" },
  { value: "BUILT_IN", label: "Built-in" },
  { value: "MINE", label: "Mine" },
  { value: "SHARED", label: "Shared by others" },
] as const;

const filterSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  program: z.enum(Program).optional().catch(undefined),
  kind: z.enum(ExamKind).optional().catch(undefined),
  scope: z.enum(["ALL", "BUILT_IN", "MINE", "SHARED"]).optional().catch(undefined),
  deleted: z.string().optional().catch(undefined),
});

const selectClass =
  "h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const actor = actorOf(user);
  const f = filterSchema.parse(await searchParams);
  const data = await getData();
  const [rows, builtIns] = await Promise.all([
    data.templates.list(actor, {
      search: f.q,
      program: f.program,
      examKind: f.kind,
      scope: f.scope,
    }),
    data.templates.list(actor, { scope: "BUILT_IN" }),
  ]);
  const blank = builtIns.find((t) => t.seedKey === "blank");
  // Built-ins first, in the order they are designed; then the newest changes.
  const order = new Map(BUILT_IN_TEMPLATES.map((b, i) => [b.seedKey, i]));
  const rank = (seedKey: string | null) => (seedKey ? (order.get(seedKey) ?? -1) : -1);
  const items = [
    ...rows.filter((r) => r.builtIn).sort((a, b) => rank(a.seedKey) - rank(b.seedKey)),
    ...rows.filter((r) => !r.builtIn),
  ].map((r) => summary(r, actor));
  const filtered = Boolean(f.q || f.program || f.kind || (f.scope && f.scope !== "ALL"));
  const scopeHref = (scope: string) => {
    const p = new URLSearchParams();
    if (f.q) p.set("q", f.q);
    if (f.program) p.set("program", f.program);
    if (f.kind) p.set("kind", f.kind);
    if (scope !== "ALL") p.set("scope", scope);
    const s = p.toString();
    return s ? `/templates?${s}` : "/templates";
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        {blank ? <NewTemplateButton blankId={blank.id} /> : null}
      </div>
      {f.deleted ? <FormAlert kind="notice">The template was deleted.</FormAlert> : null}

      <nav aria-label="Which templates" className="flex flex-wrap gap-1">
        {SCOPES.map((s) => {
          const current = (f.scope ?? "ALL") === s.value;
          return (
            <Link
              key={s.value}
              href={scopeHref(s.value)}
              aria-current={current ? "page" : undefined}
              className={`${buttonStyles.quiet} ${current ? "bg-neutral-100 font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100" : ""}`}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>

      <form
        // Remount on each filter change so the fields show the filters in the address.
        key={`${f.q ?? ""}|${f.program ?? ""}|${f.kind ?? ""}|${f.scope ?? ""}`}
        role="search"
        className="flex flex-wrap items-end gap-2"
        action="/templates"
      >
        {f.scope ? <input type="hidden" name="scope" value={f.scope} /> : null}
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
          Search
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Title or description"
            className={`${selectClass} w-full px-3`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Program
          <AutoSelect name="program" defaultValue={f.program ?? ""} className={selectClass}>
            <option value="">Any</option>
            {Object.entries(PROGRAM_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </AutoSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Exam
          <AutoSelect name="kind" defaultValue={f.kind ?? ""} className={selectClass}>
            <option value="">Any</option>
            {Object.entries(EXAM_KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </AutoSelect>
        </label>
        <button type="submit" className={`${buttonStyles.secondary} h-9`}>
          Show
        </button>
        {filtered ? (
          <Link href="/templates" className={`${buttonStyles.quiet} h-9`}>
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-sm text-neutral-600 dark:text-neutral-400" aria-live="polite">
        {items.length === 1 ? "1 template" : `${items.length} templates`}
      </p>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
          <p className="font-medium">
            {filtered ? "No templates match." : "There are no templates yet."}
          </p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {filtered
              ? "Try other words, or clear the filters."
              : "Built-in templates appear after the first administrator is set up."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((t) => (
            <li key={t.id}>
              <Link
                href={`/templates/${t.id}`}
                className="flex flex-col gap-1.5 px-4 py-3 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 dark:hover:bg-neutral-900"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium break-words [overflow-wrap:anywhere]">
                    {t.title}
                  </span>
                  {t.builtIn ? <Badge tone="blue">Built-in</Badge> : null}
                  {!t.builtIn && t.visibility === "GLOBAL" ? <Badge>Global</Badge> : null}
                  {!t.builtIn && t.mine && t.visibility === "PRIVATE" ? (
                    <Badge>Only you</Badge>
                  ) : null}
                  <PciBadge status={t.pci} />
                </span>
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {t.facts.join(" · ")}
                  {!t.mine && !t.builtIn && t.ownerName ? ` · by ${t.ownerName}` : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
