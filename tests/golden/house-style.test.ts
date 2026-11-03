// Gate 5 (local only, memory.md D3): the owner's approved paper
// `BP702T Apr 26.tex`, re-encoded into the KSV legacy template, must render
// within 3% of the original at 100 DPI on every page.
//
// Confidentiality: the paper text is read from reference_papers/ at test
// time and never written into the repository. Renders and diffs go to the
// OS temp folder. The test skips when the source is absent (CI).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { serializePaper } from "@/lib/latex/serialize";
import type { BlockNode, InlineNode, PaperInput, TemplateInput } from "@/lib/paper/schema";
import { realCompileService } from "../support/engine";
import { diffPages, pngBytes, renderPdf } from "../support/pdf";

const ORIGINAL = path.resolve("reference_papers/Question Papers/B.Pharm/BP702T Apr 26.tex");
const OUT = path.join(os.tmpdir(), "draftex-gate5");
const MAX_RATIO = 0.03;

/** The original's fancyhdr lines print nothing (\pagestyle{empty}) but clash with exam.cls in the pinned bundle. */
export function withoutFancyhdr(tex: string): string {
  return tex
    .split("\n")
    .filter((l) => !/\\usepackage\{fancyhdr\}|\\fancyh|\\fancyf|\\(head|foot)rulewidth/.test(l))
    .join("\n");
}

/**
 * Tuned against the original (memory.md D3). The hand-written paper uses a
 * separate questions list per group; these values absorb the list spacing
 * that the single generated list does not have.
 */
export const LEGACY_SPACING: Record<string, number> = {
  longBefore: 0.06,
  shortBefore: 0.12,
  headExtra: -0.04,
  afterHeader: 0.08,
  beforePart: 0.125,
  afterPart: 0.125,
  beforeGroup: 0.125,
  afterGroupHead: 0.01,
  beforeChoices: -0.09,
  beforeFooter: 0.5,
};

/** Layout of the KSV legacy external paper, tuned against the original. No paper text. */
export function legacyTemplate(
  groups: Array<{ part: number; heading: string; marks: number; slots: number; marksEach: number }>,
  instructions: string[],
  footer: string,
  spacing: Record<string, number> = LEGACY_SPACING,
): TemplateInput {
  const parts = [1, 2].map((n) => ({
    key: `s${n}`,
    title: `SECTION ${n === 1 ? "I" : "II"}`,
    separateAnswerSheet: true,
    groups: groups
      .filter((g) => g.part === n)
      .map((g, i) => ({
        key: `s${n}g${i + 1}`,
        type: "FREE" as const,
        // The hand-written paper spaces long and short groups differently from objective ones.
        ...(i === 1 ? { spaceBefore: spacing.longBefore, spaceAfterHead: spacing.headExtra } : {}),
        ...(i === 2 ? { spaceBefore: spacing.shortBefore, spaceAfterHead: spacing.headExtra } : {}),
        heading: g.heading,
        slots: g.slots,
        attempt: Math.round(g.marks / g.marksEach),
        marksEach: g.marksEach,
      })),
  }));
  return {
    structure: {
      numbering: { prefix: "Q.", separator: "" },
      marksStyle: "MARKS_COLON",
      parts,
      footer: { text: footer, ornament: "NONE" },
    },
    header: {
      lines: [
        { text: "{{university}}", size: "large", bold: true },
        { text: "{{examTitle}}", size: "normal", bold: false },
        { text: "{{programLine}}", size: "large", bold: true, ownLeading: true },
        { text: "{{courseTitle}} [{{courseCode}}]", size: "large", bold: true, ownLeading: true },
      ],
      dateRow: {
        style: "ULINE",
        left: "Date: {{date}}",
        centre: "Duration: {{duration}}",
        right: "Max marks: {{maxMarks}}",
      },
      candidateField: "NONE",
      instructions,
      pageNumbers: "NONE",
    },
    style: {
      classSize: 12,
      body: { size: 11.7, leading: 13.9 },
      geometry: { left: 1, top: 1.1, width: 6.2, height: 9.5 },
      spacing: {
        afterHeader: spacing.afterHeader,
        beforePart: spacing.beforePart,
        afterPart: spacing.afterPart,
        beforeGroup: spacing.beforeGroup,
        afterGroupHead: spacing.afterGroupHead,
        beforeChoices: spacing.beforeChoices,
        beforeFooter: spacing.beforeFooter,
      },
    },
  };
}

// ---------- extraction from the owner's source (in memory only) ----------

function plain(latex: string): InlineNode[] {
  const out: InlineNode[] = [];
  const parts = latex.split(/(\\underline\{\\hspace\{[\d.]+cm\}\})/);
  for (const part of parts) {
    const blank = /\\hspace\{([\d.]+)cm\}/.exec(part);
    if (blank) {
      out.push({ type: "blank", attrs: { widthCm: Number(blank[1]) } });
      continue;
    }
    const text = part.replace(/\\&/g, "&").replace(/\\%/g, "%").replace(/\s+/g, " ");
    if (/\\[A-Za-z]/.test(text))
      throw new Error(`Unhandled LaTeX in source: ${text.slice(0, 40)}…`);
    if (text.trim()) out.push({ type: "text", text });
  }
  const first = out[0];
  if (first?.type === "text") first.text = first.text.trimStart();
  const last = out.at(-1);
  if (last?.type === "text") last.text = last.text.trimEnd();
  return out;
}

export function extract(tex: string, spacing?: Record<string, number>): PaperInput {
  const body = tex.slice(tex.indexOf("\\begin{document}"));
  const center = /\\begin\{center\}([\s\S]*?)\\end\{center\}/.exec(body)?.[1] ?? "";
  const headerBits = [...center.matchAll(/\\textbf\{([^}]*)\}/g)].map((m) => m[1] ?? "");
  const examTitle = /\\par\s*\n\s*([^\\\n]+?)\\par/.exec(center)?.[1]?.trim() ?? "";
  const course = /^(.*) \[([A-Z0-9]+)\]$/.exec(headerBits[2] ?? "");
  const dateRow = /\\uline\{Date: (.*?) \\hfill Duration: (.*?) \\hfill Max marks: (\d+)\}/.exec(
    body,
  );
  const instructions = [...body.matchAll(/\{\\small ([^}]*)\}/g)].map((m) => (m[1] ?? "").trim());

  const groups: Array<{
    part: number;
    heading: string;
    marks: number;
    slots: number;
    marksEach: number;
  }> = [];
  const slots: PaperInput["slots"] = [];
  let part = 0;
  const tokens = body.split(
    /(\\textbf\{SECTION I+\}|\{\\textbf\{Q\.\d+ [^}]*\}\s*\\hfill\s*\\textbf\{Marks: \d+\}\}|\\begin\{questions\}[\s\S]*?\\end\{questions\})/,
  );
  for (const tok of tokens) {
    if (/^\\textbf\{SECTION/.test(tok)) part++;
    const head = /^\{\\textbf\{Q\.\d+ ([^}]*?)\s*\}\s*\\hfill\s*\\textbf\{Marks: (\d+)\}\}$/.exec(
      tok,
    );
    if (head)
      groups.push({ part, heading: head[1] ?? "", marks: Number(head[2]), slots: 0, marksEach: 1 });
    if (tok.startsWith("\\begin{questions}")) {
      const g = groups.at(-1);
      if (!g) throw new Error("questions before a group heading");
      const qs = tok.split("\\question").slice(1);
      qs.forEach((q, i) => {
        const m = /^\s*\[(\d+)\]\s*([\s\S]*)$/.exec(q);
        if (!m) throw new Error("question without [marks]");
        g.marksEach = Number(m[1]);
        const rest = (m[2] ?? "").replace(/\\end\{questions\}[\s\S]*$/, "");
        const textPart = rest.split(/\\vspace\{-0\.09in\}|\\begin\{multicols\}/)[0] ?? "";
        const blocks: BlockNode[] = [
          { type: "paragraph", content: plain(textPart.replace(/\\vspace\{[\d.]+in\}/g, "")) },
        ];
        const choices = /\\begin\{choices\}([\s\S]*?)\\end\{choices\}/.exec(rest)?.[1];
        if (choices) {
          blocks.push({
            type: "choices",
            content: choices
              .split("\\choice")
              .slice(1)
              .map((c) => ({ type: "choice" as const, content: plain(c) })),
          });
        }
        slots.push({
          groupKey: `s${g.part}g${groups.filter((x) => x.part === g.part).length}`,
          position: i + 1,
          content: { type: "doc", content: blocks },
        });
      });
      g.slots = qs.length;
    }
  }
  const footer = /\\centerline\{([^}]*)\}/.exec(body)?.[1] ?? "";
  return {
    template: legacyTemplate(groups, instructions, footer, spacing),
    emptySlots: "OMIT",
    meta: {
      university: headerBits[0] ?? "",
      examTitle,
      programLine: headerBits[1] ?? "",
      courseTitle: course?.[1] ?? "",
      courseCode: course?.[2] ?? "",
      date: dateRow?.[1] ?? "",
      duration: dateRow?.[2] ?? "",
      maxMarks: dateRow?.[3] ?? "",
    },
    slots,
  };
}

const present = fs.existsSync(ORIGINAL);

export { present as originalPresent, ORIGINAL };

describe.skipIf(!present)("house-style fidelity (gate 5, local only)", () => {
  let svc: CompileService;
  beforeAll(() => {
    svc = realCompileService();
    fs.mkdirSync(OUT, { recursive: true });
  });

  it("BP702T re-encoded into the legacy template renders within 3% of the original", async () => {
    const source = fs.readFileSync(ORIGINAL, "utf8");
    const paper = extract(source);
    const ser = serializePaper(paper);
    if (!ser.ok)
      throw new Error(ser.issues.map((i) => `${i.slotId ?? "-"} ${i.message}`).join("\n"));
    fs.writeFileSync(path.join(OUT, "generated.tex"), ser.tex);

    const [orig, gen] = await Promise.all([
      svc.compile({ userId: "gate5", tex: withoutFancyhdr(source) }),
      svc.compile({ userId: "gate5", tex: ser.tex }),
    ]);
    expect(orig.ok, "original compiles").toBe(true);
    expect(gen.ok, "generated compiles").toBe(true);
    const [a, b] = await Promise.all([renderPdf(gen.pdf as Buffer), renderPdf(orig.pdf as Buffer)]);
    const diffs = diffPages(a, b);
    for (const d of diffs) {
      fs.writeFileSync(path.join(OUT, `diff-p${d.page}.png`), pngBytes(d.diff));
      fs.writeFileSync(
        path.join(OUT, `generated-p${d.page}.png`),
        pngBytes(a[d.page - 1] ?? d.diff),
      );
      fs.writeFileSync(
        path.join(OUT, `original-p${d.page}.png`),
        pngBytes(b[d.page - 1] ?? d.diff),
      );
    }
    const report = diffs.map((d) => `p${d.page}: ${(d.ratio * 100).toFixed(2)}%`).join(", ");
    console.log(
      `gate 5 (BP702T): ${report}; pages generated ${a.length}, original ${b.length}; images in ${OUT}`,
    );
    expect(a.length).toBe(b.length);
    for (const d of diffs) expect(d.ratio, report).toBeLessThanOrEqual(MAX_RATIO);
  });
});
