// The question editor's document model. It mirrors docSchema
// (src/lib/paper/schema.ts) node for node, so whatever the editor holds can
// be stored and printed. No React here: the views are added in
// src/components/editor so this file also runs in unit tests.
import { type Extensions, Node, mergeAttributes } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Italic from "@tiptap/extension-italic";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";

/** Blocks a sub-part may hold (docSchema leafBlockNode). */
const LEAF = "block leaf";

const attr = (name: string, fallback: unknown = null) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => {
    const v = el.getAttribute(`data-${name}`);
    if (v === null) return fallback;
    if (typeof fallback === "number" || name.endsWith("Percent") || name === "widthCm") {
      return v === "" ? fallback : Number(v);
    }
    return v;
  },
  renderHTML: (attrs: Record<string, unknown>) =>
    attrs[name] === null || attrs[name] === undefined ? {} : { [`data-${name}`]: attrs[name] },
});

function atom(name: string, inline: boolean, attrs: Record<string, ReturnType<typeof attr>>) {
  return Node.create({
    name,
    group: inline ? "inline" : LEAF,
    inline,
    atom: true,
    selectable: true,
    draggable: !inline,
    addAttributes: () => attrs,
    parseHTML: () => [{ tag: `${inline ? "span" : "div"}[data-type="${name}"]` }],
    renderHTML: ({ HTMLAttributes }) => [
      inline ? "span" : "div",
      mergeAttributes(HTMLAttributes, { "data-type": name }),
    ],
  });
}

export const MathInline = atom("mathInline", true, { latex: attr("latex", "") });
export const MathDisplay = atom("mathDisplay", false, { latex: attr("latex", "") });
export const AdvancedLatex = atom("advancedLatex", false, { latex: attr("latex", "") });
export const Blank = atom("blank", true, { widthCm: attr("widthCm") });
export const Units = atom("units", true, { value: attr("value", "1"), unit: attr("unit", "") });
export const Image = atom("image", false, {
  sha256: attr("sha256", ""),
  ext: attr("ext", "png"),
  widthPercent: attr("widthPercent"),
});

export const Choice = Node.create({
  name: "choice",
  content: "inline*",
  defining: true,
  parseHTML: () => [{ tag: 'li[data-type="choice"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    "li",
    mergeAttributes(HTMLAttributes, { "data-type": "choice" }),
    0,
  ],
});

export const Choices = Node.create({
  name: "choices",
  group: LEAF,
  content: "choice{2,8}",
  addAttributes: () => ({ columns: attr("columns"), correct: attr("correct") }),
  parseHTML: () => [{ tag: 'ol[data-type="choices"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    "ol",
    mergeAttributes(HTMLAttributes, { "data-type": "choices" }),
    0,
  ],
});

export const SubPart = Node.create({
  name: "subPart",
  content: "leaf+",
  defining: true,
  parseHTML: () => [{ tag: 'li[data-type="subPart"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    "li",
    mergeAttributes(HTMLAttributes, { "data-type": "subPart" }),
    0,
  ],
});

export const SubParts = Node.create({
  name: "subParts",
  group: "block",
  content: "subPart{1,10}",
  parseHTML: () => [{ tag: 'ol[data-type="subParts"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    "ol",
    mergeAttributes(HTMLAttributes, { "data-type": "subParts" }),
    0,
  ],
});

/** The table's width on the page; the header row follows its first row's cells. */
export const QuestionTable = Table.extend({
  group: LEAF,
  addAttributes() {
    return { ...this.parent?.(), widthPercent: attr("widthPercent", 80) };
  },
});

/** Every node and mark the stored form knows, and nothing else. */
export function questionSchemaExtensions(): Extensions {
  return [
    Document,
    Paragraph.extend({ group: LEAF }),
    Text,
    Bold,
    Italic,
    Underline,
    Subscript,
    Superscript,
    HardBreak,
    BulletList.extend({ group: LEAF }),
    OrderedList.extend({ group: LEAF }),
    ListItem.extend({ content: "paragraph+" }),
    QuestionTable.configure({ resizable: false }),
    TableRow,
    TableHeader.extend({ content: "paragraph+" }),
    TableCell.extend({ content: "paragraph+" }),
    MathInline,
    MathDisplay,
    AdvancedLatex,
    Blank,
    Units,
    Image,
    Choices,
    Choice,
    SubParts,
    SubPart,
  ];
}
