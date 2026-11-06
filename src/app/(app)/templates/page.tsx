import Link from "next/link";
import { z } from "zod";
import { Badge, PciBadge } from "@/components/badge";
import { FormAlert } from "@/components/form";
import { buttonStyles, inputStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { ExamKind, Program } from "@/generated/prisma/enums";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { EXAM_KIND_LABEL, PROGRAM_LABEL } from "@/lib/templates/labels";
import { BUILT_IN_TEMPLATES } from "@/lib/templates/seeds";
import { requireUser } from "@/server/auth";
import { summary } from "@/server/template-view";
import { AutoSelect } from "@/components/auto-select";
import { NewTemplateButton, RestoreBuiltInsButton } from "./buttons";

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

const selectClass = `${inputStyles} text-small`;

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const actor = actorOf(user);
  const f = filterSchema.parse(await searchParams);
  const data = await getData();
  const [rows, builtIns, deletedBuiltIns] = await Promise.all([
    data.templates.list(actor, {
      search: f.q,
      program: f.program,
      examKind: f.kind,
      scope: f.scope,
    }),
    data.templates.list(actor, { scope: "BUILT_IN" }),
    data.templates.deletedBuiltInCount(actor),
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
        <h1 className={pageTitleStyles}>Templates</h1>
        {blank ? <NewTemplateButton blankId={blank.id} /> : null}
      </div>
      {f.deleted ? <FormAlert kind="notice">The template was deleted.</FormAlert> : null}
      {deletedBuiltIns > 0 ? <RestoreBuiltInsButton count={deletedBuiltIns} /> : null}

      <nav aria-label="Which templates" className="flex flex-wrap gap-1 border-b border-rule">
        {SCOPES.map((s) => {
          const current = (f.scope ?? "ALL") === s.value;
          return (
            <Link
              key={s.value}
              href={scopeHref(s.value)}
              aria-current={current ? "page" : undefined}
              className={
                "-mb-px inline-flex h-9 items-center border-b-2 px-2.5 text-small font-medium " +
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent " +
                (current
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-2 hover:border-rule-strong hover:text-ink")
              }
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
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-small font-medium">
          Search
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Title or description"
            className={`${selectClass} w-full px-3`}
          />
        </label>
        <label className="flex flex-col gap-1 text-small font-medium">
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
        <label className="flex flex-col gap-1 text-small font-medium">
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

      <p className="text-small text-ink-2" aria-live="polite">
        {items.length === 1 ? "1 template" : `${items.length} templates`}
      </p>

      {items.length === 0 ? (
        <div className={`${sheetStyles} px-6 py-12 text-center`}>
          <p className="font-medium">
            {filtered ? "No templates match." : "There are no templates yet."}
          </p>
          <p className="mt-1 text-small text-ink-2">
            {filtered
              ? "Try other words, or clear the filters."
              : "Built-in templates appear after the first administrator is set up."}
          </p>
        </div>
      ) : (
        <ul className={`${sheetStyles} divide-y divide-rule overflow-hidden`}>
          {items.map((t) => (
            <li key={t.id}>
              <Link
                href={`/templates/${t.id}`}
                className="flex items-stretch gap-4 px-5 py-3.5 hover:bg-sunk/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-paper text-lead font-semibold break-words [overflow-wrap:anywhere]">
                      {t.title}
                    </span>
                    {t.builtIn ? <Badge tone="blue">Built-in</Badge> : null}
                    {!t.builtIn && t.visibility === "GLOBAL" ? <Badge>Global</Badge> : null}
                    {!t.builtIn && t.mine && t.visibility === "PRIVATE" ? (
                      <Badge>Only you</Badge>
                    ) : null}
                    <PciBadge status={t.pci} />
                  </span>
                  <span className="text-small text-ink-2">
                    {t.facts.join(" · ")}
                    {!t.mine && !t.builtIn && t.ownerName ? ` · by ${t.ownerName}` : null}
                    <span className="sm:hidden">{` · ${t.marks} · ${t.duration}`}</span>
                  </span>
                </span>
                <span className="dx-margin hidden w-36 shrink-0 flex-col sm:flex justify-center text-body">
                  <span className="font-semibold text-ink">{t.marks}</span>
                  <span className="text-small whitespace-normal text-ink-2">{t.duration}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
