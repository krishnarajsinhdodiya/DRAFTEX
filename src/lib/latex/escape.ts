// Plain text → LaTeX for the XeTeX engine with Latin Modern (Tectonic's
// default). Special characters are escaped, common symbols are mapped to
// LaTeX, accented Latin letters pass through, and anything else is an error.

export interface BadChar {
  char: string;
  offset: number;
}

export type EscapeResult = { ok: true; value: string } | { ok: false; bad: BadChar[] };

const ASCII: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "#": "\\#",
  "^": "\\textasciicircum{}",
  _: "\\_",
  "%": "\\%",
  "~": "\\textasciitilde{}",
  "<": "\\textless{}",
  ">": "\\textgreater{}",
  "|": "\\textbar{}",
  "`": "\\textasciigrave{}",
  // Brackets are wrapped so text never becomes an optional argument of
  // \question, \item or \\ that happens to precede it.
  "[": "{[}",
  "]": "{]}",
  "\t": " ",
  "\n": " ",
  "\r": " ",
};

const GREEK_LOWER = "αβγδεζηθικλμνξοπρςστυφχψω";
const GREEK_LOWER_NAMES = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "o",
  "pi",
  "rho",
  "varsigma",
  "sigma",
  "tau",
  "upsilon",
  "phi",
  "chi",
  "psi",
  "omega",
];
const GREEK_UPPER: Record<string, string> = {
  Γ: "Gamma",
  Δ: "Delta",
  Θ: "Theta",
  Λ: "Lambda",
  Ξ: "Xi",
  Π: "Pi",
  Σ: "Sigma",
  Υ: "Upsilon",
  Φ: "Phi",
  Ψ: "Psi",
  Ω: "Omega",
};

function buildUnicodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  [...GREEK_LOWER].forEach((ch, i) => {
    const name = GREEK_LOWER_NAMES[i] as string;
    m.set(ch, name === "o" ? "o" : `\\ensuremath{\\${name}}`);
  });
  for (const [ch, name] of Object.entries(GREEK_UPPER)) m.set(ch, `\\ensuremath{\\${name}}`);
  const pairs: Array<[string, string]> = [
    ["µ", "\\ensuremath{\\mu}"], // micro sign U+00B5
    ["°", "\\textdegree{}"],
    ["±", "\\ensuremath{\\pm}"],
    ["∓", "\\ensuremath{\\mp}"],
    ["×", "\\ensuremath{\\times}"],
    ["÷", "\\ensuremath{\\div}"],
    ["·", "\\ensuremath{\\cdot}"],
    ["→", "\\ensuremath{\\rightarrow}"],
    ["←", "\\ensuremath{\\leftarrow}"],
    ["↔", "\\ensuremath{\\leftrightarrow}"],
    ["⇌", "\\ensuremath{\\rightleftharpoons}"],
    ["⇒", "\\ensuremath{\\Rightarrow}"],
    ["↑", "\\ensuremath{\\uparrow}"],
    ["↓", "\\ensuremath{\\downarrow}"],
    ["≤", "\\ensuremath{\\leq}"],
    ["≥", "\\ensuremath{\\geq}"],
    ["≠", "\\ensuremath{\\neq}"],
    ["≈", "\\ensuremath{\\approx}"],
    ["≡", "\\ensuremath{\\equiv}"],
    ["∞", "\\ensuremath{\\infty}"],
    ["√", "\\ensuremath{\\surd}"],
    ["∆", "\\ensuremath{\\Delta}"],
    ["′", "\\ensuremath{'}"],
    ["−", "\\ensuremath{-}"],
    ["–", "--"],
    ["—", "---"],
    ["‐", "-"],
    ["…", "\\ldots{}"],
    ["•", "\\textbullet{}"],
    ["‘", "`"],
    ["’", "'"],
    ["“", "``"],
    ["”", "''"],
    [" ", "~"],
    [" ", "\\,"],
    [" ", "\\,"],
    ["©", "\\textcopyright{}"],
    ["®", "\\textregistered{}"],
    ["™", "\\texttrademark{}"],
    ["§", "\\S{}"],
    ["¶", "\\P{}"],
    ["½", "\\ensuremath{\\tfrac{1}{2}}"],
    ["¼", "\\ensuremath{\\tfrac{1}{4}}"],
    ["¾", "\\ensuremath{\\tfrac{3}{4}}"],
    ["²", "\\textsuperscript{2}"],
    ["³", "\\textsuperscript{3}"],
    ["¹", "\\textsuperscript{1}"],
    ["₂", "\\textsubscript{2}"],
    ["₃", "\\textsubscript{3}"],
    ["₄", "\\textsubscript{4}"],
    ["Å", "\\AA{}"],
    ["₹", "Rs."],
  ];
  for (const [k, v] of pairs) m.set(k, v);
  return m;
}

const UNICODE = buildUnicodeMap();

/** Latin-1 letters and Latin Extended-A are covered by Latin Modern. */
function isLatinLetter(code: number): boolean {
  return (
    (code >= 0xc0 && code <= 0xff && code !== 0xd7 && code !== 0xf7) ||
    (code >= 0x100 && code <= 0x17f)
  );
}

/** Quote state carries across text nodes of one paragraph. */
export interface QuoteState {
  doubleOpen: boolean;
}

export function escapeText(text: string, quotes: QuoteState = { doubleOpen: false }): EscapeResult {
  const bad: BadChar[] = [];
  let out = "";
  let offset = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    const ascii = ASCII[ch];
    if (ascii !== undefined) out += ascii;
    else if (ch === '"') {
      out += quotes.doubleOpen ? "''" : "``";
      quotes.doubleOpen = !quotes.doubleOpen;
    } else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (UNICODE.has(ch)) out += UNICODE.get(ch);
    else if (isLatinLetter(code)) out += ch;
    else bad.push({ char: ch, offset });
    offset += ch.length;
  }
  return bad.length ? { ok: false, bad } : { ok: true, value: out };
}

/** Friendly name for an unsupported character, e.g. "😀 (U+1F600)". */
export function describeChar(ch: string): string {
  const cp = (ch.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, "0");
  return `${ch} (U+${cp})`;
}

/** Unicode that MathLive or users may type inside math; mapped before sanitising. */
const MATH_UNICODE: Record<string, string> = {
  "−": "-",
  "×": "\\times ",
  "÷": "\\div ",
  "·": "\\cdot ",
  "±": "\\pm ",
  "≤": "\\leq ",
  "≥": "\\geq ",
  "≠": "\\neq ",
  "≈": "\\approx ",
  "→": "\\rightarrow ",
  "∞": "\\infty ",
  "°": "^{\\circ}",
  µ: "\\mu ",
};

export function mapMathUnicode(src: string): string {
  let out = "";
  for (const ch of src) {
    const greek = GREEK_LOWER.indexOf(ch);
    if (greek >= 0 && GREEK_LOWER_NAMES[greek] !== "o") out += `\\${GREEK_LOWER_NAMES[greek]} `;
    else if (GREEK_UPPER[ch]) out += `\\${GREEK_UPPER[ch]} `;
    else out += MATH_UNICODE[ch] ?? ch;
  }
  return out;
}
