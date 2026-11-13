"use client";
// The code block inside a question (D98-D101): monospace lines with their
// numbers, a faint rule where the frame ends on this paper, and the same
// check the server runs, live under the block.
import { type NodeViewProps, NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { createContext, useContext } from "react";
import { type CodeLimits, checkCode, paperCodeLimits } from "@/lib/latex/code";

export interface CodeSettings {
  limits: CodeLimits;
  /** False where the key prints one answer table (objective groups, D101). */
  allowed: boolean;
}

/** The narrowest built-in template (5.5 in, 12 pt): a bank question fits any paper. */
export const NARROWEST_CODE_LIMITS = paperCodeLimits(12, 5.5);

export const CodeSettingsContext = createContext<CodeSettings>({
  limits: NARROWEST_CODE_LIMITS,
  allowed: true,
});

export function CodeBlockView({ node, editor, getPos, selected }: NodeViewProps) {
  const settings = useContext(CodeSettingsContext);
  const pos = typeof getPos === "function" ? getPos() : undefined;
  let inSubPart = false;
  if (typeof pos === "number") {
    const $pos = editor.state.doc.resolve(pos);
    for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === "subPart") inSubPart = true;
  }
  const limit = inSubPart ? settings.limits.subPart : settings.limits.top;
  const lines = node.textContent.split("\n");
  const check = checkCode(lines, limit);
  const longest = Math.max(...check.lines.map((l) => l.length));
  const problem = !settings.allowed
    ? "A code block cannot go in the answer table of an objective group; write the answer as text, or use inline code."
    : check.problems[0];
  const blank = node.textContent.trim() === "";
  const message = problem
    ? problem
    : blank
      ? "Type or paste code. Tab indents; Ctrl+Enter leaves the block."
      : [
          `${lines.length} ${lines.length === 1 ? "line" : "lines"}, longest ${longest} of ${limit} characters`,
          ...check.notices,
        ].join(". ");

  return (
    <NodeViewWrapper as="div" className="my-1" data-selected={selected}>
      <div
        className={
          "relative flex overflow-x-auto rounded-md border bg-sunk/60 font-mono text-small leading-5 " +
          (problem && !blank ? "border-danger" : "border-rule-strong")
        }
      >
        <div
          aria-hidden
          contentEditable={false}
          className="sticky left-0 shrink-0 select-none bg-sunk py-1.5 pr-2 pl-2 text-right text-ink-3"
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <span
            aria-hidden
            contentEditable={false}
            className="pointer-events-none absolute inset-y-0 border-l border-dashed border-rule-strong"
            style={{ left: `calc(${limit}ch + 0.5rem)` }}
          />
          <NodeViewContent<"pre">
            as="pre"
            aria-label="Code"
            spellCheck={false}
            className="dx-codeblock m-0 py-1.5 pr-3 pl-2 whitespace-pre text-ink"
          />
        </div>
      </div>
      <p
        contentEditable={false}
        role="status"
        className={`mt-1 text-caption wrap-anywhere ${problem && !blank ? "text-danger" : "text-ink-3"}`}
      >
        {message}
      </p>
    </NodeViewWrapper>
  );
}
