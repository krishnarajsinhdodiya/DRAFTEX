// Plain, serialisable views of templates for the library screens.
import type { Actor } from "@/lib/data";
import { storedFields } from "@/lib/data/templates";
import type { Issue, PciStatus } from "@/lib/rules";
import { checkTemplateFields } from "@/lib/templates/check";
import {
  COURSE_KIND_LABEL,
  EXAM_KIND_LABEL,
  PROGRAM_LABEL,
  durationText,
  marksText,
} from "@/lib/templates/labels";
import { type TemplateAccess, templateAccess } from "@/lib/templates/permissions";

type Row = Parameters<typeof storedFields>[0] & {
  id: string;
  ownerId: string;
  builtIn: boolean;
  visibility: "PRIVATE" | "GLOBAL";
  updatedAt: Date;
  version: number;
  derivedFromId: string | null;
  owner?: { name: string };
};

export interface TemplateSummary {
  id: string;
  title: string;
  description: string;
  facts: string[];
  builtIn: boolean;
  visibility: "PRIVATE" | "GLOBAL";
  mine: boolean;
  ownerName: string | null;
  pci: PciStatus;
  updatedAt: string;
}

export function summary(t: Row, actor: Actor): TemplateSummary {
  const f = storedFields(t);
  const credits =
    f.creditTier === null ? null : f.creditTier === 1 ? "1 credit" : `${f.creditTier} credits`;
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    facts: [
      PROGRAM_LABEL[f.program],
      COURSE_KIND_LABEL[f.courseKind],
      EXAM_KIND_LABEL[f.examKind],
      ...(credits ? [credits] : []),
      `${marksText(f.maxMarks)} marks`,
      durationText(f.durationMinutes),
    ],
    builtIn: t.builtIn,
    visibility: t.visibility,
    mine: t.ownerId === actor.userId,
    ownerName: t.owner?.name ?? null,
    pci: checkTemplateFields(f).pci,
    updatedAt: t.updatedAt.toISOString(),
  };
}

export interface TemplateDetail extends TemplateSummary {
  version: number;
  access: TemplateAccess;
  warnings: Issue[];
  notice?: string;
  fields: ReturnType<typeof storedFields>;
}

export function detail(t: Row, actor: Actor): TemplateDetail {
  const fields = storedFields(t);
  const check = checkTemplateFields(fields);
  return {
    ...summary(t, actor),
    version: t.version,
    access: templateAccess(t, actor),
    warnings: check.warnings,
    notice: check.notice,
    fields,
  };
}

/** "PCI 2026 syllabus, page 28" — the rules file cites printed page numbers. */
export function pageCite(page: Issue["page"]): string | null {
  return page === undefined ? null : `PCI 2026 syllabus, printed page ${page}`;
}
