// MathLive's LaTeX → LaTeX the paper accepts. MathLive writes a few commands
// of its own (\differentialD, \mleft) and \placeholder for empty boxes; these
// are mapped or refused before the allow-list sanitiser sees them.
import { sanitizeLatex } from "@/lib/latex/sanitize";

const MAP: [RegExp, string][] = [
  [/\\mleft\b/g, "\\left"],
  [/\\mright\b/g, "\\right"],
  [/\\differentialD\b/g, "\\mathrm{d}"],
  [/\\capitalDifferentialD\b/g, "\\mathrm{D}"],
  [/\\exponentialE\b/g, "\\mathrm{e}"],
  [/\\imaginaryI\b/g, "\\mathrm{i}"],
  [/\\imaginaryJ\b/g, "\\mathrm{j}"],
  [/\\operatorname\*/g, "\\operatorname"],
];

export type MathCheck = { ok: true; latex: string } | { ok: false; message: string };

export function checkMath(input: string): MathCheck {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, message: "The equation is empty." };
  if (/\\placeholder\b/.test(trimmed)) {
    return { ok: false, message: "Fill in or remove the empty boxes in the equation." };
  }
  let latex = trimmed;
  for (const [re, to] of MAP) latex = latex.replace(re, to);
  const r = sanitizeLatex(latex, "math");
  if (r.ok) return { ok: true, latex: r.value };
  return { ok: false, message: r.issues[0]?.message ?? "This equation cannot be printed." };
}
