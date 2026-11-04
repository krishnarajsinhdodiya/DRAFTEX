import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PciBadge } from "@/components/badge";
import { SavedPreview } from "@/components/saved-preview";
import { eyebrowStyles, linkStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { NotFoundError, getData } from "@/lib/data";
import { GROUP_TYPE_LABEL, marksText } from "@/lib/templates/labels";
import { requireUser } from "@/server/auth";
import { detail, pageCite } from "@/server/template-view";
import { TemplateActions } from "../buttons";
import { NewPaperButton } from "../new-paper";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const actor = actorOf(user);
  const { id } = await params;
  const data = await getData();
  let row;
  try {
    row = await data.templates.get(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const t = detail(row, actor);
  const { structure } = t.fields;
  const courses = await data.courses.list(actor, {
    program: t.fields.program,
    courseKind: t.fields.courseKind,
  });

  return (
    <div className="grid flex-1 gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link href="/templates" className={`${linkStyles} self-start text-small`}>
            ← Templates
          </Link>
          <h1 className={`${pageTitleStyles} break-words [overflow-wrap:anywhere]`}>{t.title}</h1>
          <div className="flex flex-wrap gap-2">
            {t.builtIn ? <Badge tone="blue">Built-in</Badge> : null}
            {!t.builtIn ? <Badge>{t.visibility === "GLOBAL" ? "Global" : "Only you"}</Badge> : null}
            <PciBadge status={t.pci} />
          </div>
          <p className="text-small text-ink-2">
            {[...t.facts, t.marks, t.duration].join(" · ")}
            {!t.mine && !t.builtIn && t.ownerName ? ` · by ${t.ownerName}` : null}
          </p>
          {t.description ? (
            <p className="max-w-prose break-words text-ink">{t.description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NewPaperButton
            templateId={t.id}
            templateTitle={t.title}
            courses={courses.map((c) => ({
              id: c.id,
              code: c.code,
              title: c.title,
              semesterOrYear: c.semesterOrYear,
            }))}
            unit={t.fields.program === "PHARM_D" ? "Year" : "Semester"}
          />
          <TemplateActions
            id={t.id}
            title={t.title}
            access={t.access}
            visibility={t.visibility}
            editHref={`/templates/${t.id}/edit`}
            builtIn={t.builtIn}
          />
        </div>
        {t.builtIn ? (
          <p className="text-small text-ink-2">
            Built-in templates cannot be changed. Make a copy to change one.
          </p>
        ) : null}

        <section aria-labelledby="pci" className="flex flex-col gap-2">
          <h2 id="pci" className={eyebrowStyles}>
            PCI 2026 check
          </h2>
          {t.pci === "COMPLIANT" ? (
            <p className="text-small">Follows the PCI 2026 pattern.</p>
          ) : t.pci === "NO_RULE_SET" ? (
            <p className="text-small text-ink-2">{t.notice}</p>
          ) : (
            <>
              <p className="text-small">
                This template can be used, but it differs from the PCI 2026 pattern:
              </p>
              <ul className="flex flex-col gap-1.5 text-small">
                {t.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="rounded-md border-l-2 border-caution bg-caution-soft px-3 py-2"
                  >
                    {w.message}
                    {pageCite(w.page) ? (
                      <span className="block text-caption text-ink-2">{pageCite(w.page)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="layout" className="flex flex-col gap-3">
          <h2 id="layout" className={eyebrowStyles}>
            Questions
          </h2>
          {structure.parts.map((part) => (
            <div key={part.key} className="flex flex-col gap-2">
              {part.title ? (
                <h3 className="font-paper text-body font-semibold tracking-[0.04em]">
                  {part.title}
                </h3>
              ) : null}
              <ol className={`${sheetStyles} flex flex-col divide-y divide-rule text-small`}>
                {part.groups.map((g) => (
                  <li key={g.key} className="flex items-stretch justify-between gap-4 px-4 py-2.5">
                    <span className="min-w-0 self-center break-words">
                      <span className="text-ink-2">{GROUP_TYPE_LABEL[g.type]}: </span>
                      {g.heading}
                    </span>
                    <span className="dx-margin flex w-32 shrink-0 flex-col justify-center">
                      <span className="font-semibold text-ink">
                        {marksText(g.attempt * g.marksEach)}
                      </span>
                      <span className="text-caption text-ink-2">
                        {g.attempt === g.slots ? `${g.slots}` : `any ${g.attempt} of ${g.slots}`} ×{" "}
                        {marksText(g.marksEach)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      </div>

      <aside aria-label="Preview" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <SavedPreview url={`/api/templates/${t.id}/preview?v=${t.version}`} label={t.title} />
      </aside>
    </div>
  );
}
