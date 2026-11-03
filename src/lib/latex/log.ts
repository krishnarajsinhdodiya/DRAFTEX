// Turns Tectonic's stderr and the TeX .log into structured diagnostics.
// stderr carries errors and box warnings with file:line; the .log alone
// carries LaTeX/package/class/font warnings and missing characters.

export type DiagnosticKind =
  "error" | "overfull" | "underfull" | "latex-warning" | "missing-char" | "engine-warning";

export interface Diagnostic {
  severity: "error" | "warning";
  kind: DiagnosticKind;
  message: string;
  file?: string;
  line?: number;
  /** For overfull boxes: how far too wide, in points. */
  overfullPt?: number;
  /** Set by the compile service when the line falls inside a slot. */
  slotId?: string;
}

const STDERR_LINE = /^(warning|error|caused by): (?:([^:\s][^:]*):(\d+): )?(.+)$/;
const GENERIC = [
  /^warnings were issued by the TeX engine/,
  /^something bad happened inside (?:XeTeX|xdvipdfmx)/,
  /^the (?:XeTeX|xdvipdfmx) engine had an unrecoverable error/,
  /^halted on potentially-recoverable error/,
];

function classify(message: string): DiagnosticKind {
  if (message.startsWith("Overfull")) return "overfull";
  if (message.startsWith("Underfull")) return "underfull";
  return "engine-warning";
}

export function parseStderr(stderr: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const raw of stderr.split(/\r?\n/)) {
    const m = STDERR_LINE.exec(raw.trim());
    if (!m) continue;
    // "caused by:" carries the real reason when xdvipdfmx fails.
    const level = m[1] === "warning" ? "warning" : "error";
    const file = m[2];
    const line = m[3];
    const message = m[4] as string;
    if (GENERIC.some((g) => g.test(message))) continue;
    const key = `${level}|${file ?? ""}|${line ?? ""}|${message}`;
    if (seen.has(key)) continue; // TeX reruns repeat every warning
    seen.add(key);
    const d: Diagnostic =
      level === "error"
        ? { severity: "error", kind: "error", message: message.replace(/^! /, "") }
        : { severity: "warning", kind: classify(message), message };
    if (file !== undefined) d.file = file;
    if (line !== undefined) d.line = Number(line);
    const pt = /^Overfull \\[hv]box \(([\d.]+)pt too/.exec(message);
    if (pt) d.overfullPt = Number(pt[1]);
    out.push(d);
  }
  return out;
}

const LOG_WARNING = /^((?:LaTeX|Package|Class)(?: [\w@-]+)?(?: Font)?) Warning: (.*)$/;

export function parseLog(log: string): Diagnostic[] {
  const lines = log.split(/\r?\n/);
  const out: Diagnostic[] = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? "";
    const w = LOG_WARNING.exec(text);
    if (w) {
      let message = `${w[1]} Warning: ${w[2]}`;
      // Continuation lines are indented or start with "(package)".
      while (i + 1 < lines.length && /^(\(\S+\)\s+|\s{2,})\S/.test(lines[i + 1] ?? "")) {
        message += ` ${(lines[++i] ?? "").replace(/^\(\S+\)\s+/, "").trim()}`;
      }
      const d: Diagnostic = { severity: "warning", kind: "latex-warning", message };
      const at = /on input line (\d+)/.exec(message);
      if (at) d.line = Number(at[1]);
      out.push(d);
      continue;
    }
    if (text.startsWith("Missing character: ")) {
      out.push({ severity: "warning", kind: "missing-char", message: text });
    }
  }
  return out;
}

export function parseDiagnostics(stderr: string, log: string): Diagnostic[] {
  return [...parseStderr(stderr), ...parseLog(log)];
}

/** Gate 3: any error or warning fails, except overfull boxes of at most 1 pt. */
export function goldenFailures(diags: Diagnostic[]): Diagnostic[] {
  return diags.filter((d) => !(d.kind === "overfull" && (d.overfullPt ?? Infinity) <= 1));
}

const CACHE_MISS =
  /not found|not loadable|could not (?:find|locate|open)|unable to (?:find|open|generate)|cannot proceed without/i;

/**
 * With --only-cached, a failed run whose messages mention a missing resource
 * means the cache lacks a file (fonts surface as xdvipdfmx warnings).
 */
export function looksLikeCacheMiss(diags: Diagnostic[]): boolean {
  return diags.some((d) => d.severity === "error") && diags.some((d) => CACHE_MISS.test(d.message));
}
