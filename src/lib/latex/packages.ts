// D87: a package is loaded only when the paper (or key) uses one of its
// commands, so a paper without them keeps the v0.11.0 preamble byte for byte.
import { ADVANCED_PACKAGES, type AdvancedPackage, sanitizeLatex } from "./sanitize.ts";

/**
 * Packages needed by the Advanced LaTeX blocks anywhere in `value` (a parsed
 * paper, or a key). Blocks that fail the sanitiser add nothing: they never
 * reach the engine.
 */
export function packagesUsed(value: unknown): AdvancedPackage[] {
  const used = new Set<AdvancedPackage>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (v === null || typeof v !== "object") return;
    const o = v as { type?: unknown; attrs?: { latex?: unknown } };
    if (o.type === "advancedLatex" && typeof o.attrs?.latex === "string") {
      const r = sanitizeLatex(o.attrs.latex, "advanced");
      if (r.ok) for (const p of r.packages) used.add(p);
    }
    for (const x of Object.values(v)) walk(x);
  };
  walk(value);
  return ADVANCED_PACKAGES.filter((p) => used.has(p));
}

const OPTIONS: Partial<Record<AdvancedPackage, string>> = { mhchem: "version=4" };

export function packageLines(packages: readonly AdvancedPackage[]): string[] {
  return packages.map((p) => {
    const line = OPTIONS[p] ? `\\usepackage[${OPTIONS[p]}]{${p}}` : `\\usepackage{${p}}`;
    // chemfig's simplekv.tex (pinned bundle) has Latin-1 comments; read as
    // UTF-8 they give nine engine warnings. Its code is ASCII either way.
    return p === "chemfig"
      ? `\\XeTeXdefaultencoding "iso-8859-1"${line}\\XeTeXdefaultencoding "utf-8"`
      : line;
  });
}
