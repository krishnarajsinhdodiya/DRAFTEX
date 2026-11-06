// Editor JSON (TipTap) ↔ stored slot content (docSchema). Pure, client-safe.
// TipTap adds attributes the paper does not use (colspan, list start) and has
// a separate header-cell node; the stored form keeps only what prints.
import { type Doc, docSchema } from "@/lib/paper/schema";

export interface EditorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

const KEEP_ATTRS: Record<string, string[]> = {
  mathInline: ["latex"],
  mathDisplay: ["latex"],
  advancedLatex: ["latex"],
  blank: ["widthCm"],
  units: ["value", "unit"],
  image: ["sha256", "ext", "widthPercent"],
  table: ["headerRow", "widthPercent"],
  choices: ["columns", "correct"],
  subPart: ["marks", "coTag", "bloom"],
};

const MARKS = new Set(["bold", "italic", "underline", "subscript", "superscript"]);

function isEmptyParagraph(n: EditorNode): boolean {
  return n.type === "paragraph" && !(n.content ?? []).length;
}

/** A maths or LaTeX box still being written (empty) is not part of the question yet. */
function unfinished(n: EditorNode): boolean {
  if (n.type === "mathInline" || n.type === "mathDisplay" || n.type === "advancedLatex") {
    return !String(n.attrs?.latex ?? "").trim();
  }
  if (n.type === "units") return !String(n.attrs?.unit ?? "").trim();
  return false;
}

function clean(n: EditorNode): EditorNode {
  const type = n.type === "tableHeader" ? "tableCell" : n.type;
  const out: EditorNode = { type };
  if (type === "text") {
    out.text = n.text ?? "";
    const marks = (n.marks ?? []).filter((m) => MARKS.has(m.type)).map((m) => ({ type: m.type }));
    if (marks.length) out.marks = marks;
    return out;
  }
  const keep = KEEP_ATTRS[type];
  if (keep && n.attrs) {
    const attrs: Record<string, unknown> = {};
    for (const k of keep) {
      // A CO tag may end in the space typed before its suffix (D63).
      const raw = n.attrs[k];
      const v = k === "coTag" && typeof raw === "string" ? raw.trim() || null : raw;
      if (v !== null && v !== undefined) attrs[k] = v;
    }
    if (Object.keys(attrs).length) out.attrs = attrs;
  }
  if (type === "table") {
    // The header row is whatever the editor shows: a first row of header cells.
    const first = n.content?.[0]?.content ?? [];
    const headerRow = first.length > 0 && first.every((c) => c.type === "tableHeader");
    out.attrs = { ...out.attrs, headerRow };
  }
  if (n.content?.length) {
    const kids = n.content.filter((c) => !unfinished(c)).map(clean);
    if (kids.length) out.content = kids;
  }
  return out;
}

/** Drops empty paragraphs at the start and end; an empty editor is an empty question. */
function trim(blocks: EditorNode[]): EditorNode[] {
  let a = 0;
  let b = blocks.length;
  while (a < b && isEmptyParagraph(blocks[a] as EditorNode)) a++;
  while (b > a && isEmptyParagraph(blocks[b - 1] as EditorNode)) b--;
  return blocks.slice(a, b);
}

export type ToStored = { ok: true; doc: Doc } | { ok: false; message: string };

export function toStored(editor: EditorNode): ToStored {
  const content = trim((editor.content ?? []).filter((c) => !unfinished(c)).map(clean));
  const parsed = docSchema.safeParse({ type: "doc", content });
  if (parsed.success) return { ok: true, doc: parsed.data };
  const first = parsed.error.issues[0];
  return {
    ok: false,
    message: `This question has content the paper cannot hold (${first?.path.join(".") ?? ""}: ${first?.message ?? ""}).`,
  };
}

/** Stored → editor: header cells come back as header cells, and an empty question gets one paragraph. */
export function fromStored(doc: Doc): EditorNode {
  const toEditor = (n: EditorNode, headerRow: boolean, rowIndex: number): EditorNode => {
    if (n.type === "table") {
      const header = (n.attrs?.headerRow as boolean | undefined) ?? true;
      return {
        ...n,
        content: (n.content ?? []).map((row, i) => toEditor(row, header, i)),
      };
    }
    if (n.type === "tableRow") {
      return {
        ...n,
        content: (n.content ?? []).map((cell) => ({
          ...cell,
          type: headerRow && rowIndex === 0 ? "tableHeader" : "tableCell",
          content: cell.content?.length ? cell.content : [{ type: "paragraph" }],
        })),
      };
    }
    return n.content ? { ...n, content: n.content.map((c) => toEditor(c, false, 0)) } : n;
  };
  const content = (doc.content as EditorNode[]).map((n) => toEditor(n, false, 0));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** True when the question has nothing printable. */
export function isEmptyDoc(doc: Doc): boolean {
  return doc.content.length === 0;
}
