// PCI 2026 B.Pharm rule set (SPEC §7). The only source is docs/pci-rules.json;
// the bundler embeds it at build time, so there is no copy to drift (D8).
// The file is checked with Zod and for internal consistency when loaded.
import { z } from "zod";
import rawRules from "../../../docs/pci-rules.json" with { type: "json" };

const marks = z.number().positive();
const minutes = z.number().int().positive();
const page = z.union([z.number().int().positive(), z.string().regex(/^\d+(?:-\d+)?$/)]);

const theoryGroupType = z.enum(["OBJECTIVE", "SHORT", "LONG"]);
const choice = z.object({
  slots: z.number().int().positive(),
  attempt: z.number().int().positive(),
  marksEach: marks,
});

const rawTheoryGroup = z.union([
  z.object({
    type: theoryGroupType,
    compulsory: z.literal(true),
    variants: z.array(choice).min(1),
    total: marks,
  }),
  choice.extend({ type: theoryGroupType, total: marks }),
]);

const rawTheoryPattern = z.object({
  durationMinutes: minutes,
  maxMarks: marks,
  groups: z.array(rawTheoryGroup).min(1),
});

const creditKey = z.enum(["1", "2", "3", "4"]);
const rawTheoryKind = z.record(
  z.string(),
  z.union([rawTheoryPattern, z.object({ $ref: creditKey }), z.string()]),
);

const componentType = z.enum(["SYNOPSIS", "MAJOR_EXPERIMENT", "MINOR_EXPERIMENT", "VIVA"]);
const practicalPattern = z.object({
  maxMarks: marks,
  components: z.array(z.object({ type: componentType, marks })).min(1),
});

export const ruleFileSchema = z.object({
  ruleSetId: z.string().min(1),
  program: z.literal("B_PHARM"),
  source: z.object({
    document: z.string(),
    pages: z.object({
      creditMarks: page,
      internalScheme: page,
      sessionalTheory: page,
      sessionalPractical: page,
      endSemTheory: page,
      endSemPractical: page,
    }),
  }),
  creditMarks: z.record(creditKey, z.object({ total: marks, internal: marks, external: marks })),
  theory: z.object({ SESSIONAL: rawTheoryKind, END_SEMESTER: rawTheoryKind }),
  practical: z.object({
    allowedCredits: z.array(z.number().int().positive()).min(1),
    durationRule: z.object({
      labHoursPerWeekAtLeast: z.number().positive(),
      minutesIfAtLeast: minutes,
      minutesOtherwise: minutes,
    }),
    SESSIONAL: practicalPattern,
    END_SEMESTER: practicalPattern,
  }),
});
export type RuleFile = z.infer<typeof ruleFileSchema>;

export type TheoryGroupType = z.infer<typeof theoryGroupType>;
export type Choice = z.infer<typeof choice>;
export type TheoryGroupRule = {
  type: TheoryGroupType;
  /** Every listed question must be answered (attempt = slots). */
  compulsory: boolean;
  /** PCI allows any one of these shapes, e.g. 20 × 1 or 10 × 2. */
  variants: Choice[];
  total: number;
};
export type TheoryPattern = {
  durationMinutes: number;
  maxMarks: number;
  groups: TheoryGroupRule[];
};
export type ComponentType = z.infer<typeof componentType>;
export type PracticalPattern = z.infer<typeof practicalPattern>;
export type Page = z.infer<typeof page>;
export type ExamStage = "SESSIONAL" | "END_SEMESTER";

export type RuleSet = {
  ruleSetId: string;
  program: "B_PHARM";
  pages: RuleFile["source"]["pages"];
  creditMarks: Map<number, { total: number; internal: number; external: number }>;
  theory: Record<ExamStage, Map<number, TheoryPattern>>;
  practical: RuleFile["practical"];
};

export class RuleSetError extends Error {
  override name = "RuleSetError";
}

const EPS = 1e-9;
const same = (a: number, b: number) => Math.abs(a - b) < EPS;

function resolveTheory(stage: ExamStage, kind: z.infer<typeof rawTheoryKind>) {
  const out = new Map<number, TheoryPattern>();
  for (const [credit, entry] of Object.entries(kind)) {
    if (credit.startsWith("$")) continue; // "$comment"
    if (!creditKey.safeParse(credit).success) {
      throw new RuleSetError(`${stage}: "${credit}" is not a credit value.`);
    }
    let target = entry;
    if (typeof target === "object" && "$ref" in target) {
      target = kind[target.$ref] as typeof target;
      if (typeof target !== "object" || "$ref" in target) {
        throw new RuleSetError(`${stage}.${credit}: $ref must point at a pattern.`);
      }
    }
    if (typeof target === "string") {
      throw new RuleSetError(`${stage}.${credit}: expected a pattern, found text.`);
    }
    out.set(Number(credit), {
      durationMinutes: target.durationMinutes,
      maxMarks: target.maxMarks,
      groups: target.groups.map((g) =>
        "variants" in g
          ? { type: g.type, compulsory: true, variants: g.variants, total: g.total }
          : {
              type: g.type,
              compulsory: false,
              variants: [{ slots: g.slots, attempt: g.attempt, marksEach: g.marksEach }],
              total: g.total,
            },
      ),
    });
  }
  return out;
}

/** Arithmetic the rule file must satisfy; a typo in it must never reach a teacher. */
function assertConsistent(rules: RuleSet): void {
  const external = (credit: number) => rules.creditMarks.get(credit)?.external ?? NaN;
  for (const [credit, m] of rules.creditMarks) {
    if (!same(m.internal + m.external, m.total)) {
      throw new RuleSetError(`creditMarks.${credit}: internal + external ≠ total.`);
    }
  }
  for (const stage of ["SESSIONAL", "END_SEMESTER"] as const) {
    for (const [credit, p] of rules.theory[stage]) {
      const where = `theory.${stage}.${credit}`;
      for (const g of p.groups) {
        for (const v of g.variants) {
          if (v.attempt > v.slots) throw new RuleSetError(`${where}: attempt > slots.`);
          if (g.compulsory && v.attempt !== v.slots) {
            throw new RuleSetError(`${where}: compulsory group with attempt ≠ slots.`);
          }
          if (!same(v.attempt * v.marksEach, g.total)) {
            throw new RuleSetError(`${where}: ${g.type} shape does not add up to ${g.total}.`);
          }
        }
      }
      const sum = p.groups.reduce((s, g) => s + g.total, 0);
      if (!same(sum, p.maxMarks)) throw new RuleSetError(`${where}: groups ≠ maxMarks.`);
      if (stage === "END_SEMESTER" && !same(p.maxMarks, external(credit))) {
        throw new RuleSetError(`${where}: maxMarks ≠ external marks for ${credit} credits.`);
      }
    }
  }
  for (const stage of ["SESSIONAL", "END_SEMESTER"] as const) {
    const p = rules.practical[stage];
    const sum = p.components.reduce((s, c) => s + c.marks, 0);
    if (!same(sum, p.maxMarks))
      throw new RuleSetError(`practical.${stage}: components ≠ maxMarks.`);
  }
  for (const credit of rules.practical.allowedCredits) {
    if (!same(rules.practical.END_SEMESTER.maxMarks, external(credit))) {
      throw new RuleSetError(
        `practical: end-semester marks ≠ external marks for ${credit} credit.`,
      );
    }
  }
}

export function parseRuleSet(input: unknown): RuleSet {
  const parsed = ruleFileSchema.safeParse(input);
  if (!parsed.success) {
    throw new RuleSetError(`pci-rules.json is malformed: ${z.prettifyError(parsed.error)}`);
  }
  const f = parsed.data;
  const rules: RuleSet = {
    ruleSetId: f.ruleSetId,
    program: f.program,
    pages: f.source.pages,
    creditMarks: new Map(Object.entries(f.creditMarks).map(([k, v]) => [Number(k), v])),
    theory: {
      SESSIONAL: resolveTheory("SESSIONAL", f.theory.SESSIONAL),
      END_SEMESTER: resolveTheory("END_SEMESTER", f.theory.END_SEMESTER),
    },
    practical: f.practical,
  };
  assertConsistent(rules);
  return rules;
}

let cached: RuleSet | undefined;
/** The PCI 2026 B.Pharm rule set from docs/pci-rules.json. */
export function pciRuleSet(): RuleSet {
  cached ??= parseRuleSet(rawRules);
  return cached;
}

/** Rule sets by id (SPEC §14: M.Pharm / Pharm.D sets can be added as JSON later). */
export function ruleSetById(id: string | null | undefined): RuleSet | null {
  if (!id) return null;
  const pci = pciRuleSet();
  return id === pci.ruleSetId ? pci : null;
}
