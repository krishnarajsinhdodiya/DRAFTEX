// Code blocks (D98-D102) and grouped Advanced LaTeX (D103): the rules, the
// line width each place allows, and the LaTeX the serializers write.
import { describe, expect, it } from "vitest";
import { dupSource, plainText, unprintableChars } from "@/lib/bank/question";
import {
  KEY_CODE_LIMITS,
  MAX_CODE_LINES,
  VERBATIM_BEGIN,
  VERBATIM_END_RE,
  checkCode,
  indentPt,
  keyCodeLimit,
  paperCodeLimit,
  paperCodeLimits,
  unprintableCode,
} from "@/lib/latex/code";
import { serializeKey } from "@/lib/latex/key";
import { packagesUsed } from "@/lib/latex/packages";
import { FORBIDDEN_PRIMITIVES, sanitizeLatex } from "@/lib/latex/sanitize";
import { serializePaper } from "@/lib/latex/serialize";
import type { BlockNode, Doc, LeafBlockNode, PaperInput } from "@/lib/paper/schema";
import { code, codePaper, longLine, p, referencePaper, t } from "../../fixtures/papers/papers";

const adv = (latex: string): LeafBlockNode => ({ type: "advancedLatex", attrs: { latex } });

function paperWith(content: BlockNode[], style: Record<string, unknown> = {}): PaperInput {
  const base = referencePaper();
  return {
    ...base,
    template: { ...base.template, style: { ...base.template.style, ...style } },
    slots: [{ groupKey: "g2", position: 1, content: { type: "doc", content }, coTag: "BP104T.01" }],
  };
}

function tex(content: BlockNode[], style: Record<string, unknown> = {}): string {
  const r = serializePaper(paperWith(content, style));
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("\n"));
  return r.tex;
}

function issues(content: BlockNode[], style: Record<string, unknown> = {}): string[] {
  const r = serializePaper(paperWith(content, style));
  return r.ok ? [] : r.issues.map((i) => i.message);
}

/**
 * \\linewidth at question level and in a sub-part, measured with the pinned
 * engine (exam class, 5.5 in text width = 397.48499 pt), per class size and
 * body size (2026-11-13). The formula must give these within 0.01 pt.
 */
const MEASURED: [10 | 11 | 12, number, number, number][] = [
  [10, 8, 381.62898, 362.94098],
  [10, 9, 380.65898, 360.75497],
  [10, 9.5, 380.34398, 360.03947],
  [10, 10, 379.70499, 358.59499],
  [10, 10.5, 379.06598, 357.15048],
  [10, 10.95, 378.49089, 355.85045],
  [10, 11, 378.71298, 356.35498],
  [10, 11.7, 377.8366, 354.374],
  [10, 12, 377.46098, 353.52498],
  [10, 14, 374.95699, 347.86499],
  [11, 8, 381.15399, 361.991],
  [11, 10, 379.23, 357.645],
  [11, 10.95, 378.0159, 354.90047],
  [11, 11.5, 377.612, 353.99],
  [11, 13, 375.734, 349.745],
  [12, 8, 380.62898, 360.94098],
  [12, 9, 379.65898, 358.75497],
  [12, 10.95, 377.49089, 353.85045],
  [12, 11, 377.71298, 354.35498],
  [12, 11.7, 376.8366, 352.374],
  [12, 11.9, 376.5862, 351.808],
  [12, 12, 376.46098, 351.52498],
  [12, 13, 375.20898, 348.69498],
  [12, 14, 373.95699, 345.86499],
];

describe("line width (D100)", () => {
  it.each(MEASURED)(
    "class %i pt, body %f pt: the indents the engine measured",
    (cls, body, q, part) => {
      expect(397.48499 - indentPt(cls, 0, body)).toBeCloseTo(q, 2);
      expect(397.48499 - indentPt(cls, 1, body)).toBeCloseTo(part, 2);
    },
  );

  it("matches the engine's measurements on the narrowest built-in template", () => {
    // docs/SECURITY-REVIEW-PHASE13.md: 5.5 in, 12 pt → 64 and 59 characters.
    expect(paperCodeLimit(12, 5.5, 0)).toBe(64);
    expect(paperCodeLimit(12, 5.5, 1)).toBe(59);
  });

  it("follows the text width, the class size and the body size", () => {
    const at = (classSize: 10 | 11 | 12, width: number, body?: number) =>
      paperCodeLimits({
        classSize,
        geometry: { width },
        ...(body ? { body: { size: body } } : {}),
      });
    expect(at(12, 6.2)).toEqual({ top: 73, subPart: 68 });
    expect(at(12, 6.2, 11.7)).toEqual({ top: 73, subPart: 68 });
    expect(at(12, 6.6)).toEqual({ top: 78, subPart: 73 });
    expect(at(11, 5.5)).toEqual({ top: 70, subPart: 66 });
    expect(at(10, 5.5)).toEqual({ top: 78, subPart: 74 });
    expect(at(10, 5.5, 14)).toEqual({ top: 77, subPart: 72 });
  });

  it("never goes below zero on the narrowest width a template may set", () => {
    expect(paperCodeLimit(12, 2, 1)).toBeGreaterThanOrEqual(0);
    expect(paperCodeLimit(12, 0.1, 1)).toBe(0);
  });

  it("has fixed limits for the answer key (12 pt article, 0.8 in margins)", () => {
    expect(KEY_CODE_LIMITS).toEqual({ top: keyCodeLimit(0), subPart: keyCodeLimit(1) });
    expect(KEY_CODE_LIMITS.top).toBe(82);
    expect(KEY_CODE_LIMITS.subPart).toBe(77);
  });
});

describe("checkCode", () => {
  it("passes plain ASCII through, drops trailing spaces and keeps leading ones", () => {
    const r = checkCode(["  x = 1   ", "", "%#&_^~$\\{}"], 64);
    expect(r).toEqual({ lines: ["  x = 1", "", "%#&_^~$\\{}"], problems: [], notices: [] });
  });

  it("turns tabs into four spaces, with a notice", () => {
    const r = checkCode(["\tx", "\t\ty"], 64);
    expect(r.lines).toEqual(["    x", "        y"]);
    expect(r.notices).toEqual(["Tabs print as 4 spaces."]);
  });

  it("converts curly quotes, dashes and non-breaking spaces, with notices", () => {
    const r = checkCode(["print(“hi”, ‘a’) – x — y", "a\u00a0b"], 64);
    expect(r.lines).toEqual(["print(\"hi\", 'a') - x - y", "a b"]);
    expect(r.problems).toEqual([]);
    expect(r.notices).toHaveLength(2);
  });

  it("refuses any other character by name, including the rupee sign and controls", () => {
    const r = checkCode(["cost = ₹5", "é", "\u0007bell"], 64);
    expect(r.problems).toEqual([
      "Code may use plain ASCII characters only; this block has ₹ (U+20B9), é (U+00E9), a control character (U+0007).",
    ]);
    expect(unprintableCode(["😀"])).toEqual(["😀 (U+1F600)"]);
    expect(checkCode(["é ü ç ñ ß ø å ğ"], 64).problems[0]).toMatch(/ø \(U\+00F8\), and 2 more\.$/);
  });

  it.each([
    "\\end{Verbatim}",
    "  \\end{Verbatim}\\input{x}",
    "\\end {Verbatim}",
    "\\end{ Verbatim}",
    "\\END{verbatim}",
    "\t\\end\t{Verbatim}",
  ])("refuses a line that could close the block: %j", (line) => {
    const r = checkCode(["x", line], 64);
    expect(r.problems[0]).toBe("Line 2 contains \\end{Verbatim}, which would end the code block.");
  });

  it("refuses \\end{Verbatim} anywhere in a line: fancyvrb ends the block there too", () => {
    // Found by the engine fuzz: fancyvrb drops the text before it and reads the
    // following lines as LaTeX (tests/golden/code-security.test.ts proves it).
    for (const line of ["x \\end{Verbatim}", "&\\end{Verbatim}^^5c", "print('\\end{verbatim}')"]) {
      expect(VERBATIM_END_RE.test(line), line).toBe(true);
      expect(checkCode([line], 64).problems).toEqual([
        "Line 1 contains \\end{Verbatim}, which would end the code block.",
      ]);
    }
    // Other environments' ends and a broken \\end print as text.
    expect(checkCode(["\\end{itemize} \\end x{Verbatim}"], 64).problems).toEqual([]);
  });

  it("refuses an empty block and more than 40 lines", () => {
    expect(checkCode(["", "  "], 64).problems).toEqual(["The code block is empty."]);
    const many = Array.from({ length: MAX_CODE_LINES + 1 }, (_, i) => `l${i}`);
    expect(checkCode(many, 64).problems).toEqual([
      "A code block may have at most 40 lines; this one has 41.",
    ]);
    expect(checkCode(many.slice(1), 64).problems).toEqual([]);
  });

  it("measures lines after tabs are expanded and names the first long one", () => {
    expect(checkCode(["x".repeat(64)], 64).problems).toEqual([]);
    expect(checkCode(["\t" + "x".repeat(61)], 64).problems).toEqual([
      "Line 1 is 65 characters; at most 64 fit inside the frame here. Break the line or shorten it.",
    ]);
    expect(checkCode(["ok", "x".repeat(70), "y".repeat(80)], 64).problems).toEqual([
      "Line 2 (and 1 more) is 70 characters; at most 64 fit inside the frame here. Break the line or shorten it.",
    ]);
  });
});

describe("serializer: code blocks (D99, D101)", () => {
  it("writes fixed Verbatim options and the lines with no indentation", () => {
    const out = tex([p("Read:"), code("for i in range(3):", "    print(i)")]);
    expect(out).toContain(
      `  \\question Read:\n  ${VERBATIM_BEGIN}\nfor i in range(3):\n    print(i)\n\\end{Verbatim}\n`,
    );
    expect(out).not.toContain("\u0001");
  });

  it("loads fancyvrb only when a block is there", () => {
    expect(tex([code("x")])).toContain("\\usepackage{fancyvrb}");
    expect(tex([p("x")])).not.toContain("fancyvrb");
    expect(packagesUsed({ content: [{ type: "codeBlock", attrs: { lines: ["x"] } }] })).toEqual([
      "fancyvrb",
    ]);
  });

  it("puts the number on its own line when a question or sub-part starts with code", () => {
    expect(tex([code("x = 1"), p("Explain.")])).toContain(
      `\\question \\mbox{}\\par\n  ${VERBATIM_BEGIN}`,
    );
    const parts: BlockNode = {
      type: "subParts",
      content: [{ type: "subPart", content: [code("y = 2")] }],
    };
    expect(tex([p("Both:"), parts])).toContain(`\\part \\mbox{}\\par\n  ${VERBATIM_BEGIN}`);
  });

  it("puts the tail after the block on a line of its own", () => {
    const out = tex([p("Read:"), code("x")], { showMarksPerQuestion: true });
    expect(out).toContain("\\end{Verbatim}\n  \\dxTail{[BP104T.01]\\quad [4]}");
  });

  it("applies the sub-part width inside a sub-part", () => {
    const limits = paperCodeLimits(referencePaper().template.style as never);
    const inPart = (line: string): BlockNode => ({
      type: "subParts",
      content: [{ type: "subPart", content: [p("a"), code(line)] }],
    });
    expect(issues([code(longLine(limits.top))])).toEqual([]);
    expect(issues([code(longLine(limits.top + 1))])[0]).toMatch(/at most 73 fit/);
    expect(issues([inPart(longLine(limits.subPart))])).toEqual([]);
    expect(issues([inPart(longLine(limits.top))])[0]).toMatch(/at most 68 fit/);
  });

  it("reports the rules as the slot's problems", () => {
    expect(issues([code("\\end{Verbatim}\\input{/etc/passwd}")])).toEqual([
      "Code block: Line 1 contains \\end{Verbatim}, which would end the code block.",
    ]);
  });

  it("writes inline code in the typewriter font with straight double quotes", () => {
    const out = tex([p("Run ", t('print("a & b")', "code"), ".")]);
    expect(out).toContain("\\texttt{print(\\textquotedbl{}a \\& b\\textquotedbl{})}");
  });

  it("names characters inline code cannot print", () => {
    expect(issues([p(t("x 😀", "code"))])[0]).toMatch(/😀 \(U\+1F600\)/);
  });

  it("the fixture paper serializes", () => {
    expect(serializePaper(codePaper()).ok).toBe(true);
  });
});

describe("answer key: code blocks (D101, D102)", () => {
  const key = (groupKey: string, answer: Doc) =>
    serializeKey(codePaper(), [{ groupKey, position: 1, answerKey: answer, keyCriteria: [] }]);
  const doc = (...content: BlockNode[]): Doc => ({ type: "doc", content });

  it("holds a code block in a model answer, closing the paragraph on the next line", () => {
    const r = key("g2", doc(code("print(1)")));
    if (!r.ok) throw new Error(r.issues[0]?.message);
    expect(r.tex).toContain("\\usepackage{fancyvrb}");
    expect(r.tex).toContain("print(1)\n\\end{Verbatim}\n\\par");
  });

  it("refuses a code block in the objective group's answer table", () => {
    const r = key("g1", doc(code("print(1)")));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.message).toMatch(/cannot go in the answer table/);
  });

  it("uses the key's own width", () => {
    const r = key("g2", doc(code(longLine(KEY_CODE_LIMITS.top + 1))));
    expect(r.ok).toBe(false);
    expect(key("g2", doc(code(longLine(KEY_CODE_LIMITS.top)))).ok).toBe(true);
  });
});

describe("grouped Advanced LaTeX (D103)", () => {
  it("wraps a block in \\begingroup ... \\par\\endgroup", () => {
    expect(tex([p("See:"), adv("\\large big")])).toContain(
      "See:\\par\n  \\begingroup \\large big\\dxTail{[BP104T.01]}\\par\\endgroup",
    );
  });

  it("puts the question's tail inside the group when the block ends the question", () => {
    const out = tex([adv("\\large big")], { showMarksPerQuestion: true, showBloom: true });
    expect(out).toContain("\\begingroup \\large big\\dxTail{[BP104T.01]\\quad [4]}\\par\\endgroup");
  });

  it("sets a bold tail at normal size inside the group, leaving the block's spacing alone", () => {
    const r = serializePaper({
      ...paperWith([adv("\\large big")], {
        showMarksPerQuestion: true,
        showBloom: true,
        coTagStyle: "BOLD",
      }),
      slots: [
        {
          groupKey: "g2",
          position: 1,
          content: { type: "doc", content: [adv("\\large big")] },
          coTag: "BP104T.01",
          bloomLevel: "APPLY",
        },
      ],
    });
    if (!r.ok) throw new Error(r.issues[0]?.message);
    expect(r.tex).toContain(
      "\\begingroup \\large big\\dxBloom{{\\normalsize (Bloom: Apply)}}\\dxTail{{\\normalsize [BP104T.01]\\quad [4]}}\\par\\endgroup",
    );
  });

  it("keeps the tail outside when other blocks follow", () => {
    const out = tex([adv("\\large big"), p("after")], { showMarksPerQuestion: true });
    expect(out).toContain("\\begingroup \\large big\\par\\endgroup\\par\n  after\\dxTail{");
  });

  it("leaves the paragraph open before display maths", () => {
    const out = tex([adv("Then"), { type: "mathDisplay", attrs: { latex: "x=1" } }]);
    expect(out).toContain("\\begingroup Then\\endgroup\n  \\[ x=1 \\]");
  });

  it("does not end the paragraph inside the objective key table's cell", () => {
    const r = serializeKey(codePaper(), [
      {
        groupKey: "g1",
        position: 1,
        answerKey: { type: "doc", content: [adv("\\textbf{B}")] },
        keyCriteria: [],
      },
    ]);
    if (!r.ok) throw new Error(r.issues[0]?.message);
    expect(r.tex).toContain("\\begingroup \\textbf{B}\\endgroup");
  });

  it("refuses a block that tries to close the group or open a Verbatim of its own", () => {
    for (const latex of [
      "\\endgroup \\large",
      "\\begin{Verbatim}x\\end{Verbatim}",
      "}{\\large x",
    ]) {
      expect(sanitizeLatex(latex, "advanced").ok).toBe(false);
    }
  });
});

describe("blocklist (Phase 13)", () => {
  it.each(["VerbatimInput", "fvset", "DefineVerbatimEnvironment", "RecustomVerbatimCommand"])(
    "names \\%s",
    (name) => {
      expect(FORBIDDEN_PRIMITIVES).toContain(name);
      const r = sanitizeLatex(`\\${name}{x}`, "advanced");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues[0]?.message).toBe(`\\${name} is not allowed for safety.`);
    },
  );
});

describe("bank (D102)", () => {
  const doc = (...content: BlockNode[]): Doc => ({ type: "doc", content });

  it("counts code text for search and the duplicate key", () => {
    const a = doc(p("What prints?"), code("print(1)"));
    const b = doc(p("What prints?"), code("print(2)"));
    expect(plainText(a)).toBe("What prints?\nprint(1)");
    expect(dupSource(a)).not.toBe(dupSource(b));
  });

  it("names characters a code block cannot print", () => {
    expect(unprintableChars(doc(code("x = ₹5", "y = “q”")))).toEqual(["₹ (U+20B9)"]);
  });
});
