// Template structure, header and style (SPEC §7) plus slot content in the
// TipTap JSON shape the Phase 5 editor will produce. Zod at the boundary.
import { z } from "zod";
import { BLOOM_LEVELS } from "./bloom.ts";
import { CO_TAG_HINT, CO_TAG_RE } from "./co-tag.ts";

const key = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, "Keys use letters, digits, - and _ only.");
const inches = z.number().min(0).max(5);
/** Vertical adjustments may be negative, as in the hand-written papers. */
const gap = z.number().min(-1).max(2);

// ---------- slot content (TipTap-shaped) ----------

export const markSchema = z.object({
  type: z.enum(["bold", "italic", "underline", "subscript", "superscript"]),
});

export const textNode = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
  marks: z.array(markSchema).optional(),
});
export const hardBreakNode = z.object({ type: z.literal("hardBreak") });
export const mathInlineNode = z.object({
  type: z.literal("mathInline"),
  attrs: z.object({ latex: z.string() }),
});
export const blankNode = z.object({
  type: z.literal("blank"),
  attrs: z.object({ widthCm: z.number().min(0.5).max(15) }).optional(),
});
export const unitsNode = z.object({
  type: z.literal("units"),
  attrs: z.object({
    value: z.string().regex(/^[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/, "Use a plain number."),
    unit: z.string().min(1).max(64),
  }),
});

export const inlineNode = z.discriminatedUnion("type", [
  textNode,
  hardBreakNode,
  mathInlineNode,
  blankNode,
  unitsNode,
]);
export type InlineNode = z.infer<typeof inlineNode>;

export const paragraphNode = z.object({
  type: z.literal("paragraph"),
  content: z.array(inlineNode).optional(),
});
export type ParagraphNode = z.infer<typeof paragraphNode>;

export const mathDisplayNode = z.object({
  type: z.literal("mathDisplay"),
  attrs: z.object({ latex: z.string() }),
});

export const imageNode = z.object({
  type: z.literal("image"),
  attrs: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    ext: z.enum(["png", "jpg", "pdf"]),
    /** Percent of the line width; omitted = natural size. */
    widthPercent: z.number().min(5).max(100).optional(),
  }),
});

export const tableNode = z.object({
  type: z.literal("table"),
  attrs: z
    .object({
      headerRow: z.boolean().default(true),
      widthPercent: z.number().min(20).max(100).default(80),
    })
    .optional(),
  content: z
    .array(
      z.object({
        type: z.literal("tableRow"),
        content: z
          .array(
            z.object({
              type: z.literal("tableCell"),
              content: z.array(paragraphNode).optional(),
            }),
          )
          .min(1)
          .max(12),
      }),
    )
    .min(1)
    .max(60),
});
export type TableNode = z.infer<typeof tableNode>;

export const choicesNode = z.object({
  type: z.literal("choices"),
  attrs: z
    .object({
      columns: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional(),
      /** 0-based index of the correct choice (answer key). */
      correct: z.number().int().min(0).optional(),
    })
    .optional(),
  content: z
    .array(z.object({ type: z.literal("choice"), content: z.array(inlineNode).optional() }))
    .min(2)
    .max(8),
});
export type ChoicesNode = z.infer<typeof choicesNode>;

export const advancedNode = z.object({
  type: z.literal("advancedLatex"),
  attrs: z.object({ latex: z.string() }),
});

export const listNode = z.object({
  type: z.enum(["orderedList", "bulletList"]),
  content: z
    .array(z.object({ type: z.literal("listItem"), content: z.array(paragraphNode).min(1) }))
    .min(1),
});

const leafBlocks = [
  paragraphNode,
  mathDisplayNode,
  imageNode,
  tableNode,
  choicesNode,
  advancedNode,
  listNode,
] as const;

export const leafBlockNode = z.discriminatedUnion("type", [...leafBlocks]);
export type LeafBlockNode = z.infer<typeof leafBlockNode>;

export const bloomSchema = z.enum(BLOOM_LEVELS);
export const coTagSchema = z.string().regex(CO_TAG_RE, CO_TAG_HINT);

/**
 * A sub-part's own marks, CO tag and Bloom level (D65). The editor writes
 * null for an unset value; the question's values apply where these are unset.
 */
export const subPartAttrs = z.object({
  marks: z.number().positive().max(100).nullable().optional(),
  coTag: coTagSchema.nullable().optional(),
  bloom: bloomSchema.nullable().optional(),
});
export type SubPartAttrs = z.infer<typeof subPartAttrs>;

export const subPartNode = z.object({
  type: z.literal("subPart"),
  attrs: subPartAttrs.optional(),
  content: z.array(leafBlockNode).min(1),
});
export type SubPartNode = z.infer<typeof subPartNode>;

/** Sub-parts (a)(b)(c): one level deep, as in the reference papers. */
export const subPartsNode = z.object({
  type: z.literal("subParts"),
  content: z.array(subPartNode).min(1).max(10),
});

export const blockNode = z.discriminatedUnion("type", [...leafBlocks, subPartsNode]);
export type BlockNode = z.infer<typeof blockNode>;

export const docSchema = z.object({ type: z.literal("doc"), content: z.array(blockNode) });
export type Doc = z.infer<typeof docSchema>;

// ---------- template ----------

export const groupSchema = z.object({
  key,
  type: z.enum([
    "OBJECTIVE",
    "SHORT",
    "LONG",
    "SHORT_NOTE",
    "PRACTICAL_PERFORM",
    "SYNOPSIS",
    "VIVA",
    "FREE",
  ]),
  heading: z.string().min(1).max(300),
  slots: z.number().int().min(1).max(100),
  attempt: z.number().int().min(1).max(100),
  marksEach: z.number().positive().max(100),
  /** Every question must be answered; the checker then requires attempt = slots. */
  compulsory: z.boolean().optional(),
  objectiveLayout: z.enum(["TWO_COLUMN", "ONE_COLUMN", "FOUR_COLUMN"]).optional(),
  /**
   * D71: "GROUP" (On the group) printed nothing and is no longer offered;
   * stored values still load and read as "NONE", which prints the same.
   */
  showCoTag: z
    .enum(["NONE", "GROUP", "SLOT"])
    .default("SLOT")
    .transform((v): "NONE" | "SLOT" => (v === "GROUP" ? "NONE" : v)),
  /**
   * GROUP: one number for the group ("Q.2"), its questions numbered 1, 2, 3.
   * QUESTION: every question gets its own number ("Q.6"), continuing across
   * groups and parts, with its marks at the right; the heading is not printed.
   */
  numbering: z.enum(["GROUP", "QUESTION"]).optional(),
  /** Overrides style.spacing for this group's heading (inches). */
  spaceBefore: gap.optional(),
  spaceAfterHead: gap.optional(),
});
export type Group = z.infer<typeof groupSchema>;

export const partSchema = z.object({
  key,
  title: z.string().max(100).optional(),
  separateAnswerSheet: z.boolean().default(false),
  groups: z.array(groupSchema).min(1),
});

export const structureSchema = z.object({
  numbering: z.object({ prefix: z.string().max(8), separator: z.string().max(4) }),
  marksStyle: z.enum(["MARKS_COLON", "PARENS", "BRACKETS"]),
  parts: z.array(partSchema).min(1),
  footer: z.object({
    text: z.string().max(100),
    ornament: z.enum(["ASTERISKS", "NONE"]),
  }),
});
export type Structure = z.infer<typeof structureSchema>;

export const headerLineSchema = z.object({
  /** May contain {{placeholders}}; everything else is literal text. */
  text: z.string().min(1).max(200),
  size: z.enum(["small", "normal", "large"]).default("normal"),
  bold: z.boolean().default(false),
  /** Line spacing follows this line's size (as with an unbraced \large in hand-written papers). */
  ownLeading: z.boolean().default(false),
});

export const headerSchema = z.object({
  lines: z.array(headerLineSchema).min(1).max(8),
  logoLeft: z
    .object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), ext: z.enum(["png", "jpg", "pdf"]) })
    .optional(),
  dateRow: z.object({
    style: z.enum(["RULE", "ULINE", "NONE"]),
    left: z.string().max(80),
    centre: z.string().max(80),
    right: z.string().max(80),
  }),
  candidateField: z.enum(["EXAM_NO", "ROLL_NO", "SEAT_NO", "NONE"]),
  instructions: z.array(z.string().min(1).max(300)).max(12),
  pageNumbers: z.enum(["NONE", "X_OF_Y"]),
});
export type Header = z.infer<typeof headerSchema>;

export const styleSchema = z.object({
  classSize: z.union([z.literal(10), z.literal(11), z.literal(12)]),
  body: z
    .object({ size: z.number().min(8).max(14), leading: z.number().min(9).max(18) })
    .optional(),
  /** Times (newtx) is not offered yet: under XeTeX it always emits font warnings. */
  font: z.enum(["CM"]).default("CM"),
  geometry: z.object({
    left: inches,
    top: inches,
    width: z.number().min(2).max(8.27),
    height: z.number().min(2).max(11.69),
  }),
  showMarksPerQuestion: z.boolean().default(false),
  /** Print "(Bloom: Remember)" after each question (Phase 10); off keeps old output. */
  showBloom: z.boolean().default(false),
  coTagStyle: z.enum(["FOOTNOTE", "BOLD"]).default("FOOTNOTE"),
  logoWidth: z.number().min(0.05).max(0.3).default(0.1),
  spacing: z
    .object({
      /** Between a logo header block and the date row. */
      afterTitle: gap.default(0.06),
      afterHeader: gap.default(0.04),
      beforePart: gap.default(0.12),
      afterPart: gap.default(0.12),
      beforeGroup: gap.default(0.14),
      afterGroupHead: gap.default(0.02),
      beforeChoices: z.number().min(-1).max(1).default(-0.09),
      beforeFooter: gap.default(0.35),
    })
    .prefault({}),
});
export type Style = z.infer<typeof styleSchema>;

export const templateSchema = z.object({
  structure: structureSchema,
  header: headerSchema,
  style: styleSchema,
});
export type TemplateInput = z.input<typeof templateSchema>;

// ---------- paper ----------

export const metaSchema = z.object({
  university: z.string().max(200).default(""),
  institute: z.string().max(200).default(""),
  examTitle: z.string().max(200).default(""),
  programLine: z.string().max(200).default(""),
  courseTitle: z.string().max(200).default(""),
  courseCode: z.string().max(40).default(""),
  date: z.string().max(40).default(""),
  duration: z.string().max(40).default(""),
  maxMarks: z.string().max(10).default(""),
});
export type Meta = z.infer<typeof metaSchema>;

export const slotSchema = z.object({
  groupKey: key,
  /** 1-based position inside the group. */
  position: z.number().int().min(1).max(100),
  content: docSchema,
  marks: z.number().positive().max(100).optional(),
  coTag: coTagSchema.optional(),
  bloomLevel: bloomSchema.optional(),
});
export type Slot = z.infer<typeof slotSchema>;

export const paperSchema = z.object({
  template: templateSchema,
  meta: metaSchema,
  slots: z.array(slotSchema),
  /** OMIT for fixtures; PLACEHOLDER for template previews. */
  emptySlots: z.enum(["OMIT", "PLACEHOLDER"]).default("PLACEHOLDER"),
});
export type PaperInput = z.input<typeof paperSchema>;
export type Paper = z.infer<typeof paperSchema>;
