// The question editor's document model. It mirrors docSchema
// (src/lib/paper/schema.ts) node for node, so whatever the editor holds can
// be stored and printed. No React here: the views are added in
// src/components/editor so this file also runs in unit tests.
import { type Extensions, Mark, Node, markInputRule, mergeAttributes } from "@tiptap/core";
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
    if (
      typeof fallback === "number" ||
      name.endsWith("Percent") ||
      name === "widthCm" ||
      name === "marks"
    ) {
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
  addKeyboardShortcuts() {
    return {
      // Enter on an empty last choice leaves the choices, as in a list.
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type.name !== "choice") return false;
        const choices = $from.node(-1);
        const last = $from.index(-1) === choices.childCount - 1;
        if ($from.parent.content.size > 0 || !last || choices.childCount <= 2) return false;
        const from = $from.before();
        const after = $from.after(-1) - $from.parent.nodeSize;
        return editor
          .chain()
          .deleteRange({ from, to: from + $from.parent.nodeSize })
          .insertContentAt(after, { type: "paragraph" })
          .setTextSelection(after + 1)
          .run();
      },
      // Backspace in an empty choice removes it while at least two remain.
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type.name !== "choice" || $from.parentOffset > 0) return false;
        if ($from.parent.content.size > 0 || $from.node(-1).childCount <= 2) return false;
        const from = $from.before();
        return editor
          .chain()
          .deleteRange({ from, to: from + $from.parent.nodeSize })
          .run();
      },
    };
  },
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
  /** D65: the sub-part's own marks, CO tag and Bloom level; null follows the question. */
  addAttributes: () => ({ marks: attr("marks"), coTag: attr("coTag"), bloom: attr("bloom") }),
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

/** Spaces a Tab key inserts in a code block (the printed rule turns tabs into 4 too). */
export const CODE_INDENT = "    ";

/**
 * A code block (D98): plain text lines, no marks. Enter adds a line; Tab
 * indents; Ctrl/Cmd+Enter, three Enters at the end, or ArrowDown on the last
 * line leave it.
 */
export const CodeBlock = Node.create({
  name: "codeBlock",
  group: LEAF,
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  parseHTML: () => [{ tag: 'pre[data-type="codeBlock"]', preserveWhitespace: "full" }],
  renderHTML: ({ HTMLAttributes }) => [
    "pre",
    mergeAttributes(HTMLAttributes, { "data-type": "codeBlock" }),
    ["code", 0],
  ],
  addKeyboardShortcuts() {
    const inCode = () => this.editor.state.selection.$from.parent.type.name === this.name;
    const leave = (): boolean => {
      const { $from } = this.editor.state.selection;
      const after = $from.after();
      return this.editor
        .chain()
        .insertContentAt(after, { type: "paragraph" })
        .setTextSelection(after + 1)
        .run();
    };
    return {
      Tab: () => (inCode() ? this.editor.commands.insertContent(CODE_INDENT) : false),
      "Mod-Enter": () => (inCode() ? leave() : false),
      Enter: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || !inCode()) return false;
        // Three Enters at the end: drop the two empty lines and leave.
        const atEnd = $from.parentOffset === $from.parent.nodeSize - 2;
        if (!atEnd || !$from.parent.textContent.endsWith("\n\n")) return false;
        return this.editor
          .chain()
          .command(({ tr }) => {
            tr.delete($from.pos - 2, $from.pos);
            return true;
          })
          .command(() => leave())
          .run();
      },
      ArrowDown: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || !inCode()) return false;
        const lastLine = !$from.parent.textContent.slice($from.parentOffset).includes("\n");
        const lastNode = $from.after() === this.editor.state.doc.content.size;
        return lastLine && lastNode ? leave() : false;
      },
    };
  },
});

/** Inline code (D98): `text` in the typewriter font; no other mark with it. */
export const InlineCode = Mark.create({
  name: "code",
  excludes: "_",
  code: true,
  parseHTML: () => [{ tag: "code" }],
  renderHTML: ({ HTMLAttributes }) => [
    "code",
    mergeAttributes(HTMLAttributes, { class: "dx-code" }),
    0,
  ],
  addKeyboardShortcuts() {
    return { "Mod-e": () => this.editor.commands.toggleMark(this.name) };
  },
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(`(?!\s+`)([^`]+)`(?!\s+`))$/, type: this.type })];
  },
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
    InlineCode,
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
    CodeBlock,
  ];
}
