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
  table: ["headerRow", "widthPercent", "columns", "borders"],
  tableCell: ["colspan", "rowspan"],
  choices: ["columns", "correct"],
  subPart: ["marks", "coTag", "bloom"],
};

const MARKS = new Set(["bold", "italic", "underline", "subscript", "superscript", "code"]);

function isEmptyParagraph(n: EditorNode): boolean {
  return n.type === "paragraph" && !(n.content ?? []).length;
}

/** A maths or LaTeX box still being written (empty) is not part of the question yet. */
function unfinished(n: EditorNode): boolean {
  if (n.type === "mathInline" || n.type === "mathDisplay" || n.type === "advancedLatex") {
    return !String(n.attrs?.latex ?? "").trim();
  }
  if (n.type === "units") return !String(n.attrs?.unit ?? "").trim();
  if (n.type === "codeBlock") return codeText(n).trim() === "";
  return false;
}

/** A code block's text in the editor: one text node, lines split by "\n". */
const codeText = (n: EditorNode): string => (n.content ?? []).map((c) => c.text ?? "").join("");

function clean(n: EditorNode): EditorNode {
  const type = n.type === "tableHeader" ? "tableCell" : n.type;
  // D98: stored as its lines; the editor holds one text node.
  if (type === "codeBlock") return { type, attrs: { lines: codeText(n).split("\n") } };
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
    const { columns, borders, ...rest } = out.attrs ?? {};
    out.attrs = { ...rest, headerRow, ...tableOptions(columns, borders) };
  }
  if (type === "tableCell" && out.attrs) {
    // TipTap writes colspan 1 and rowspan 1 on every cell; only a merge is stored.
    const attrs = Object.fromEntries(
      Object.entries(out.attrs).filter(([, v]) => typeof v === "number" && v > 1),
    );
    if (Object.keys(attrs).length) out.attrs = attrs;
    else delete out.attrs;
  }
  if (n.content?.length) {
    const kids = n.content.filter((c) => !unfinished(c)).map(clean);
    if (kids.length) out.content = kids;
  }
  if (type === "table" && out.content) out.content = dropCoveredRows(out.content);
  return out;
}

/**
 * Merging every cell of a row into the row above leaves an empty row in the
 * editor (HTML allows it). The stored table has no empty rows: the row is
 * dropped and the merges that crossed it get one row shorter.
 */
function dropCoveredRows(rows: EditorNode[]): EditorNode[] {
  const out: EditorNode[] = [];
  rows.forEach((row) => {
    if (row.content?.length) {
      out.push(row);
      return;
    }
    const k = out.length;
    out.forEach((above, r) => {
      for (const cell of above.content ?? []) {
        const span = Number(cell.attrs?.rowspan ?? 1);
        if (r + span > k) {
          const attrs: Record<string, unknown> = { ...cell.attrs, rowspan: span - 1 };
          if (span - 1 === 1) delete attrs.rowspan;
          if (Object.keys(attrs).length) cell.attrs = attrs;
          else delete cell.attrs;
        }
      }
    });
  });
  return out;
}

/**
 * D105: only settings that change the print are stored, so a table left at
 * left-aligned, equal columns and booktabs rules keeps today's stored form
 * (and LaTeX, D106).
 */
function tableOptions(columns: unknown, borders: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (Array.isArray(columns)) {
    const cols = columns.map((c: { align?: unknown; width?: unknown } | null) => ({
      ...(c?.align && c.align !== "LEFT" ? { align: c.align } : {}),
      ...(typeof c?.width === "number" ? { width: c.width } : {}),
    }));
    if (cols.some((c) => Object.keys(c).length)) out.columns = cols;
  }
  if (borders === "GRID") out.borders = "GRID";
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
    if (n.type === "codeBlock") {
      const text = ((n.attrs?.lines as string[] | undefined) ?? []).join("\n");
      return { type: "codeBlock", ...(text ? { content: [{ type: "text", text }] } : {}) };
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
