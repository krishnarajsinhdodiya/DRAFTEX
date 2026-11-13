// The editor's schema holds exactly what the paper stores: every fixture
// question survives stored → editor → stored unchanged.
import { getSchema } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { fromStored, isEmptyDoc, toStored, type EditorNode } from "@/lib/editor/convert";
import { questionSchemaExtensions } from "@/lib/editor/nodes";
import { type Doc, docSchema } from "@/lib/paper/schema";
import { FIXTURES } from "../../fixtures/papers/papers";

const schema = getSchema(questionSchemaExtensions());

function roundTrip(doc: Doc): Doc {
  const node = PMNode.fromJSON(schema, fromStored(doc));
  node.check();
  const back = toStored(node.toJSON() as EditorNode);
  if (!back.ok) throw new Error(back.message);
  return back.doc;
}

const questions = Object.entries(FIXTURES).flatMap(([name, make]) =>
  make().slots.map((s, i) => [`${name} #${i + 1}`, docSchema.parse(s.content)] as const),
);

describe("editor schema ↔ stored content", () => {
  it.each(questions)("%s round-trips unchanged", (_name, doc) => {
    expect(roundTrip(doc)).toEqual(doc);
  });

  it("turns an empty question into one paragraph and back into nothing", () => {
    const empty: Doc = { type: "doc", content: [] };
    expect(fromStored(empty)).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    const back = roundTrip(empty);
    expect(isEmptyDoc(back)).toBe(true);
  });

  it("drops what the paper does not print and keeps the header row as the editor shows it", () => {
    const fromEditor: EditorNode = {
      type: "doc",
      content: [
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "bold" }, { type: "link", attrs: { href: "http://x" } }],
            },
          ],
        },
        {
          type: "table",
          attrs: { widthPercent: 50 },
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { colspan: 1 }, content: [{ type: "paragraph" }] },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
        },
        { type: "blank", attrs: { widthCm: null } },
        { type: "paragraph" },
      ],
    };
    const r = toStored(fromEditor);
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/cannot hold/) });
    const fixed = { ...fromEditor, content: (fromEditor.content ?? []).slice(0, 4) };
    const ok = toStored(fixed);
    if (!ok.ok) throw new Error(ok.message);
    expect(ok.doc.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold" }] }] },
      {
        type: "table",
        attrs: { widthPercent: 50, headerRow: false },
        content: [
          { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph" }] }] },
        ],
      },
      { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
    ]);
  });
});

describe("unfinished boxes", () => {
  it("leaves out maths, LaTeX and units that are still empty", () => {
    const r = toStored({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a" },
            { type: "mathInline", attrs: { latex: " " } },
            { type: "units", attrs: { value: "1", unit: "" } },
          ],
        },
        { type: "mathDisplay", attrs: { latex: "" } },
        { type: "advancedLatex", attrs: { latex: "" } },
        { type: "paragraph", content: [{ type: "mathInline", attrs: { latex: "" } }] },
      ],
    });
    expect(r).toEqual({
      ok: true,
      doc: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
      },
    });
  });
});

describe("code (D98)", () => {
  it("stores a code block as its lines and leaves out an empty one", () => {
    const r = toStored({
      type: "doc",
      content: [
        { type: "codeBlock", content: [{ type: "text", text: "a = 1\n  b\n" }] },
        { type: "codeBlock" },
        { type: "codeBlock", content: [{ type: "text", text: " \n " }] },
      ],
    });
    expect(r).toEqual({
      ok: true,
      doc: {
        type: "doc",
        content: [{ type: "codeBlock", attrs: { lines: ["a = 1", "  b", ""] } }],
      },
    });
  });

  it("keeps the inline code mark and nothing the editor adds to it", () => {
    const r = toStored({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "x()", marks: [{ type: "code", attrs: { class: "x" } }] },
          ],
        },
      ],
    });
    expect(r.ok && r.doc.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "x()", marks: [{ type: "code" }] }],
    });
  });

  it("lets a code block sit in a sub-part but not in a choice or a table cell", () => {
    const inPart = PMNode.fromJSON(schema, {
      type: "doc",
      content: [
        {
          type: "subParts",
          content: [
            {
              type: "subPart",
              content: [{ type: "codeBlock", content: [{ type: "text", text: "x" }] }],
            },
          ],
        },
      ],
    });
    expect(() => inPart.check()).not.toThrow();
    expect(schema.nodes.choice?.contentMatch.matchType(schema.nodes.codeBlock!)).toBeFalsy();
    expect(schema.nodes.tableCell?.contentMatch.matchType(schema.nodes.codeBlock!)).toBeFalsy();
    expect(schema.nodes.codeBlock?.spec.marks).toBe("");
  });
});
