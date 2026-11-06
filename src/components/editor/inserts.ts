// What a question can have inserted, shared by the toolbar and the "/" menu.
import type { Editor } from "@tiptap/core";

export interface Insert {
  id: string;
  label: string;
  /** Extra words the "/" menu matches. */
  keywords: string;
  run: (editor: Editor) => void;
  advancedOnly?: boolean;
  /** Needs a file from the user (handled by the caller). */
  needsFile?: boolean;
}

const paragraphs = (n: number) => Array.from({ length: n }, () => ({ type: "paragraph" }));

export const INSERTS: Insert[] = [
  {
    id: "equation",
    label: "Equation",
    keywords: "math formula maths inline",
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({ type: "mathInline", attrs: { latex: "" } })
        .run(),
  },
  {
    id: "equation-line",
    label: "Equation on its own line",
    keywords: "math display formula centred",
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({ type: "mathDisplay", attrs: { latex: "" } })
        .run(),
  },
  {
    id: "table",
    label: "Table",
    keywords: "rows columns grid",
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "image",
    label: "Picture",
    keywords: "image structure diagram figure png jpg pdf svg coreldraw",
    needsFile: true,
    run: () => {},
  },
  {
    id: "choices",
    label: "Choices (A–D)",
    keywords: "mcq options multiple choice",
    run: (e) => {
      const from = e.state.selection.from;
      e.chain()
        .focus()
        .insertContent({
          type: "choices",
          content: Array.from({ length: 4 }, () => ({ type: "choice" })),
        })
        .run();
      // Put the cursor in choice A.
      let at: number | null = null;
      e.state.doc.nodesBetween(Math.max(0, from - 1), e.state.doc.content.size, (n, pos) => {
        if (at === null && n.type.name === "choices") at = pos;
        return at === null;
      });
      if (at !== null) e.commands.setTextSelection((at as number) + 2);
    },
  },
  {
    id: "blank",
    label: "Blank line",
    keywords: "fill in the blank gap underline",
    run: (e) => e.chain().focus().insertContent({ type: "blank" }).run(),
  },
  {
    id: "subparts",
    label: "Sub-parts (a)(b)(c)",
    keywords: "parts subquestions abc",
    run: (e) => {
      const from = e.state.selection.from;
      e.chain()
        .focus()
        .insertContent({
          type: "subParts",
          content: Array.from({ length: 2 }, () => ({ type: "subPart", content: paragraphs(1) })),
        })
        .run();
      // Put the cursor in (a), as Choices does with A.
      let at: number | null = null;
      e.state.doc.nodesBetween(Math.max(0, from - 1), e.state.doc.content.size, (n, pos) => {
        if (at === null && n.type.name === "subParts") at = pos;
        return at === null;
      });
      if (at !== null) e.commands.setTextSelection((at as number) + 3);
    },
  },
  {
    id: "units",
    label: "Number with unit",
    keywords: "si siunitx mg ml celsius quantity",
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({ type: "units", attrs: { value: "1", unit: "" } })
        .run(),
  },
  {
    id: "numbered",
    label: "Numbered list",
    keywords: "ordered list 1 2 3",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "bullets",
    label: "Bulleted list",
    keywords: "unordered list points",
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "advanced",
    label: "Advanced LaTeX",
    keywords: "latex code raw",
    advancedOnly: true,
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({ type: "advancedLatex", attrs: { latex: "" } })
        .run(),
  },
];

export function matchInserts(query: string, allowAdvanced: boolean): Insert[] {
  const q = query.trim().toLowerCase();
  return INSERTS.filter((i) => allowAdvanced || !i.advancedOnly).filter(
    (i) => !q || `${i.label} ${i.keywords}`.toLowerCase().includes(q),
  );
}

/** Default width on the paper for a picture: its size at 300 DPI on a 6-inch line, 10–100%. */
export function defaultWidthPercent(img: { ext: string; width: number }): number {
  const inches = img.ext === "pdf" ? img.width / 72 : img.width / 300;
  const pct = Math.round(((inches / 6) * 100) / 5) * 5;
  return Math.min(100, Math.max(10, pct));
}
