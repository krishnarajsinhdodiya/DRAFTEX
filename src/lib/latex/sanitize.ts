// Allow-list sanitiser for user LaTeX (math snippets and "Advanced LaTeX").
// Tectonic's --untrusted mode blocks shell escape but still lets \input read
// and \openout write absolute paths (verified 2026-11-03 and 2026-11-07), so
// this is the only barrier between user text and TeX's file primitives.
// Anything not explicitly allowed fails. docs/SECURITY-REVIEW-PHASE12.md has
// the review behind the package commands (D86-D91).

export type SanitizeMode = "math" | "advanced";

/** Packages an Advanced LaTeX block may pull in (D86), in preamble order. */
export const ADVANCED_PACKAGES = [
  "mhchem",
  "chemfig",
  "mathtools",
  "multirow",
  "enumitem",
  "xcolor",
  "framed",
  "tfrupee",
] as const;
export type AdvancedPackage = (typeof ADVANCED_PACKAGES)[number];

export interface SanitizeIssue {
  message: string;
  /** 0-based character offset in the snippet. */
  offset: number;
}

export type SanitizeResult =
  { ok: true; value: string; packages: AdvancedPackage[] } | { ok: false; issues: SanitizeIssue[] };

export const MAX_SNIPPET_BYTES = 4096;

/** Named in SPEC §8; reported by name so the message is useful. */
export const FORBIDDEN_PRIMITIVES = [
  "input",
  "include",
  "openin",
  "openout",
  "read",
  "write",
  "immediate",
  "catcode",
  "def",
  "let",
  "csname",
  "usepackage",
  "documentclass",
  "special",
  "directlua",
  "write18",
  "loop",
  "jobname",
  "endinput",
  "makeatletter",
  // D91: second layer. None of these is on the allow-list; naming them gives
  // a clear message and a tripwire test (docs/SECURITY-REVIEW-PHASE12.md).
  "RequirePackage",
  "ShellEscape",
  "closein",
  "closeout",
  "newwrite",
  "newread",
  "scantokens",
  "expandafter",
  "string",
  "uppercase",
  "lowercase",
  "edef",
  "gdef",
  "xdef",
  "newcommand",
  "renewcommand",
  "providecommand",
  "DeclareRobustCommand",
  "newenvironment",
  "renewenvironment",
  "IfFileExists",
  "InputIfFileExists",
  "XeTeXpicfile",
  "XeTeXpdffile",
  "includegraphics",
  "lstinputlisting",
  "addplot",
  "pgfplotstableread",
  "usetikzlibrary",
  "tcbuselibrary",
  "tikzset",
  "pgfkeys",
  "chemmove",
  "definesubmol",
  "setchemfig",
  "setlist",
  "newlist",
  "pagecolor",
  "definecolor",
  "DeclarePairedDelimiter",
  "mathtoolsset",
] as const;

const words = (s: string) => s.trim().split(/\s+/);

const GREEK = words(`alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota
  kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega
  Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega`);

const MATH_COMMANDS = new Set([
  ...GREEK,
  ...words(`frac dfrac tfrac sqrt binom dbinom tbinom cdot times div pm mp ast star circ bullet
  leq geq le ge neq ne approx equiv sim simeq cong propto ll gg leqslant geqslant asymp
  infty partial nabla prime ell hbar Re Im aleph emptyset varnothing
  to rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow longrightarrow
  longleftarrow rightleftharpoons leftrightharpoons uparrow downarrow updownarrow mapsto
  xrightarrow xleftarrow
  in notin ni subset subseteq supset supseteq cup cap setminus forall exists neg lnot land lor
  wedge vee oplus otimes odot dagger ddagger angle triangle perp parallel mid
  therefore because checkmark
  sum prod coprod int iint iiint oint bigcup bigcap lim limsup liminf max min sup inf det
  log ln lg exp sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth
  limits nolimits
  left right middle big Big bigg Bigg bigl bigr Bigl Bigr
  langle rangle lfloor rfloor lceil rceil lvert rvert lVert rVert vert Vert
  overline underline hat bar vec dot ddot tilde widehat widetilde mathring overbrace underbrace
  overset underset stackrel substack
  ldots cdots vdots ddots dots dotsc dotsb
  quad qquad
  text textrm textbf textit mathrm mathbf mathit mathsf mathtt mathcal mathbb boldsymbol
  operatorname displaystyle textstyle scriptstyle phantom hphantom vphantom boxed
  pmod bmod
  hline cline
  begin end
  SI si num qty unit ang degree celsius percent per square cubic
  centi milli micro nano kilo mega gram litre liter metre meter mole second minute hour
  kelvin pascal joule watt volt ampere hertz newton`),
]);

const ADVANCED_ONLY = new Set(
  words(`textsuperscript textsubscript emph textsc texttt textsf underline
  small footnotesize scriptsize large Large normalsize
  centering raggedright raggedleft par newline linebreak noindent
  hspace vspace hfill vfill smallskip medskip bigskip rule
  item toprule midrule bottomrule cmidrule multicolumn
  makebox fbox mbox parbox textdegree S P copyright dag ddag
  choice CorrectChoice`),
);

const MATH_ENVIRONMENTS = new Set(
  words(
    `matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix cases array aligned gathered split`,
  ),
);

const ADVANCED_ENVIRONMENTS = new Set([
  ...MATH_ENVIRONMENTS,
  ...words(`center flushleft flushright itemize enumerate tabular tabularx minipage multicols
  choices equation* align* gather* multline* displaymath math`),
]);

/** Commands each package adds, accepted only in Advanced LaTeX (D88). */
export const PACKAGE_COMMANDS: Record<string, AdvancedPackage> = {
  ce: "mhchem",
  chemfig: "chemfig",
  multirow: "multirow",
  textcolor: "xcolor",
  rupee: "tfrupee",
  ...Object.fromEntries(
    words(`coloneqq eqqcolon Coloneqq prescript mathclap mathllap mathrlap
    xleftrightarrow xLeftarrow xRightarrow xLeftrightarrow xhookleftarrow xhookrightarrow
    xmapsto xrightharpoonup xrightharpoondown xleftharpoonup xleftharpoondown
    xrightleftharpoons xleftrightharpoons underbracket overbracket`).map((c) => [c, "mathtools"]),
  ),
};

export const PACKAGE_ENVIRONMENTS: Record<string, AdvancedPackage> = {
  framed: "framed",
  dcases: "mathtools",
  "dcases*": "mathtools",
  rcases: "mathtools",
  "pmatrix*": "mathtools",
  "bmatrix*": "mathtools",
};

/** D90: the colours \textcolor may name, optionally mixed as red!50 or red!50!black. */
const COLOURS = words(`black white gray darkgray lightgray red green blue cyan magenta yellow
  brown orange purple teal olive violet`);
const COLOUR_RE = new RegExp(
  `^(?:${COLOURS.join("|")})(?:!(?:100|\\d{1,2})(?:!(?:${COLOURS.join("|")}))?)?$`,
);

const DIM = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)(?:pt|mm|cm|em|ex|in)|0`;
const LABEL = String.raw`(?:[A-Za-z0-9 ().:\-]|\\(?:alph|Alph|roman|Roman|arabic)\*)+`;
/** D90: enumitem keys a list may set; no code hooks (before, after, first), no setters. */
const ENUM_KEY_RE = new RegExp(
  String.raw`^(?:label\*?=(?:${LABEL}|\{${LABEL}\})|start=\d{1,3}|(?:leftmargin|labelindent|itemindent|labelwidth)=(?:${DIM}|\*)|(?:itemsep|topsep|parsep|partopsep|labelsep)=(?:${DIM})|align=(?:left|right|parleft)|nosep|noitemsep|wide)$`,
);

const MAX_MULTIROW = 20;

/** Control symbols (\ followed by one non-letter). */
const MATH_SYMBOLS = new Set([..."\\,;:! {}%&#$_|>"]);
const ADVANCED_SYMBOLS = new Set([...MATH_SYMBOLS, "(", ")", "[", "]", "-", "/", "'", "`", '"']);

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function sanitizeLatex(src: string, mode: SanitizeMode): SanitizeResult {
  const issues: SanitizeIssue[] = [];
  const fail = (message: string, offset: number) => issues.push({ message, offset });

  if (byteLength(src) > MAX_SNIPPET_BYTES) {
    return {
      ok: false,
      issues: [{ message: `This LaTeX is longer than ${MAX_SNIPPET_BYTES / 1024} KB.`, offset: 0 }],
    };
  }

  const commands = mode === "math" ? MATH_COMMANDS : new Set([...MATH_COMMANDS, ...ADVANCED_ONLY]);
  const packageCommands: Record<string, AdvancedPackage> = mode === "math" ? {} : PACKAGE_COMMANDS;
  const packageEnvironments: Record<string, AdvancedPackage> =
    mode === "math" ? {} : PACKAGE_ENVIRONMENTS;
  const used = new Set<AdvancedPackage>();
  /** Brace depth at which an open \chemfig argument closes (D89). */
  let chemfigDepth = -1;
  const environments = mode === "math" ? MATH_ENVIRONMENTS : ADVANCED_ENVIRONMENTS;
  const symbols = mode === "math" ? MATH_SYMBOLS : ADVANCED_SYMBOLS;

  const braces: number[] = [];
  const envs: Array<{ name: string; offset: number }> = [];
  let dollars = 0;
  let lastDollar = -1;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    const code = ch.charCodeAt(0);

    if (ch === "^" && src[i + 1] === "^") {
      fail("“^^” character escapes are not allowed.", i);
      i++;
      continue;
    }
    if (code < 0x20 && ch !== "\n" && ch !== "\t" && ch !== "\r") {
      fail("Control characters are not allowed.", i);
      continue;
    }
    if (code > 0x7e) {
      fail(`The character “${ch}” cannot be used here; use a LaTeX command instead.`, i);
      continue;
    }
    if (ch === "%") {
      fail("A bare % starts a LaTeX comment; write \\% for a percent sign.", i);
      continue;
    }
    if (ch === "#") {
      fail("A bare # is not allowed; write \\# for a hash sign.", i);
      continue;
    }
    if (ch === "$") {
      if (mode === "math") fail("$ is not allowed inside an equation.", i);
      else {
        dollars++;
        lastDollar = i;
      }
      continue;
    }
    if (ch === "{") {
      braces.push(i);
      continue;
    }
    if (ch === "}") {
      if (braces.pop() === undefined) fail("There is a } without a matching {.", i);
      if (braces.length < chemfigDepth) chemfigDepth = -1;
      continue;
    }
    if (chemfigDepth >= 0) {
      // D89: inside \chemfig, [..] is a bond's options; only angle, length and
      // the two atom numbers (fields 1-4) are allowed: the 5th field and any
      // key reach tikz, which can open files.
      if (ch === "[") {
        const close = src.indexOf("]", i);
        const body = close < 0 ? "" : src.slice(i + 1, close);
        if (close < 0 || !/^[0-9:.+\-, ]*$/.test(body) || body.split(",").length > 4) {
          fail(
            "In \\chemfig, bond options may only hold an angle, a length and two atom numbers, such as [:30] or [2,1.5].",
            i,
          );
          if (close < 0) break;
        }
        i = close;
        continue;
      }
      if (ch === "!" || ch === "@") {
        fail(`“${ch}” is not allowed inside \\chemfig.`, i);
        continue;
      }
    }
    if (ch !== "\\") continue;

    const start = i;
    const next = src[i + 1];
    if (next === undefined) {
      fail("The LaTeX ends with a lone backslash.", i);
      break;
    }
    if (!/[A-Za-z]/.test(next)) {
      i++;
      if (!symbols.has(next)) fail(`“\\${next}” is not allowed.`, start);
      continue;
    }
    let j = i + 1;
    while (j < src.length && /[A-Za-z]/.test(src[j] as string)) j++;
    const name = src.slice(i + 1, j);
    i = j - 1;

    if ((FORBIDDEN_PRIMITIVES as readonly string[]).includes(name)) {
      fail(`\\${name} is not allowed for safety.`, start);
      continue;
    }
    const pkg = packageCommands[name];
    if (pkg) {
      const rest = src.slice(j);
      if (name === "chemfig") {
        if (chemfigDepth >= 0) {
          fail("\\chemfig cannot sit inside another \\chemfig.", start);
          continue;
        }
        if (rest[0] !== "{") {
          fail(
            "\\chemfig must be followed directly by the molecule in braces, with no options.",
            start,
          );
          continue;
        }
        chemfigDepth = braces.length + 1;
      } else if (name === "textcolor") {
        const m = /^\{([^{}]*)\}\{/.exec(rest);
        if (!m || !COLOUR_RE.test(m[1] as string)) {
          fail(
            `\\textcolor needs a colour from this list, then the text: ${COLOURS.join(", ")}.`,
            start,
          );
          continue;
        }
        i = j + m[0].length - 2; // the text's "{" is read by the loop
      } else if (name === "multirow") {
        const m = /^\{(\d{1,2})\}\{(\*|[^{}]*)\}\{/.exec(rest);
        const n = m ? Number(m[1]) : 0;
        if (
          !m ||
          n < 1 ||
          n > MAX_MULTIROW ||
          !(m[2] === "*" || new RegExp(`^(?:${DIM})$`).test(m[2] as string))
        ) {
          fail(
            `\\multirow needs {rows}{width or *}{text}, with 1 to ${MAX_MULTIROW} rows and a width such as 3cm.`,
            start,
          );
          continue;
        }
        i = j + m[0].length - 2;
      }
      used.add(pkg);
      continue;
    }
    if (!commands.has(name)) {
      fail(`\\${name} is not a supported command here.`, start);
      continue;
    }
    if (name === "begin" || name === "end") {
      const m = /^\{([A-Za-z]+\*?)\}/.exec(src.slice(j));
      if (!m) {
        fail(`\\${name} must be followed by an environment name in braces.`, start);
        continue;
      }
      const env = m[1] as string;
      i = j + m[0].length - 1;
      const envPkg = packageEnvironments[env];
      if (envPkg) used.add(envPkg);
      else if (!environments.has(env)) {
        fail(`The environment “${env}” is not allowed here.`, start);
        continue;
      }
      // LaTeX looks past spaces and one line break for an optional argument.
      const optAt = i + 1 + (/^\s*/.exec(src.slice(i + 1))?.[0].length ?? 0);
      if (
        name === "begin" &&
        mode === "advanced" &&
        (env === "enumerate" || env === "itemize") &&
        src[optAt] === "["
      ) {
        // D90: enumitem options, read whole here; each key must be on the list.
        const close = src.indexOf("]", optAt);
        const body = close < 0 ? "" : src.slice(optAt + 1, close);
        const keys = body.split(",").map((k) => k.trim());
        const bad = close < 0 ? [body] : keys.filter((k) => !ENUM_KEY_RE.test(k));
        if (bad.length) {
          fail(
            `List option “${bad[0]}” is not allowed. Use label, start, nosep, noitemsep, wide, align or a spacing such as itemsep=2pt.`,
            optAt,
          );
          if (close < 0) break;
        } else used.add("enumitem");
        i = close;
      }
      if (name === "begin") envs.push({ name: env, offset: start });
      else {
        const open = envs.pop();
        if (!open || open.name !== env) {
          fail(`\\end{${env}} does not match the environment that is open.`, start);
          if (open) envs.push(open);
        }
      }
    }
  }

  for (const b of braces) fail("There is a { without a matching }.", b);
  for (const e of envs) fail(`\\begin{${e.name}} has no matching \\end{${e.name}}.`, e.offset);
  if (dollars % 2 === 1) fail("There is a $ without a matching $.", lastDollar);

  issues.sort((a, b) => a.offset - b.offset);
  return issues.length === 0
    ? { ok: true, value: src, packages: ADVANCED_PACKAGES.filter((p) => used.has(p)) }
    : { ok: false, issues };
}
