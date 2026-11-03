// Allow-list sanitiser for user LaTeX (math snippets and "Advanced LaTeX").
// Tectonic's --untrusted mode blocks shell escape but still lets \input read
// absolute paths (verified 2026-11-03), so this is the only barrier between
// user text and TeX's file primitives. Anything not explicitly allowed fails.

export type SanitizeMode = "math" | "advanced";

export interface SanitizeIssue {
  message: string;
  /** 0-based character offset in the snippet. */
  offset: number;
}

export type SanitizeResult = { ok: true; value: string } | { ok: false; issues: SanitizeIssue[] };

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
  centi milli micro nano kilo mega gram litre liter metre meter mole molar second minute hour
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
      continue;
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
      if (!environments.has(env)) {
        fail(`The environment “${env}” is not allowed here.`, start);
        continue;
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
  return issues.length === 0 ? { ok: true, value: src } : { ok: false, issues };
}
