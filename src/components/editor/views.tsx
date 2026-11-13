"use client";
// How each special node looks and is edited inside a question. Popovers are
// Radix (keyboard, focus return, Escape) styled with DRAFTEX tokens.
import * as Popover from "@radix-ui/react-popover";
import {
  type NodeViewProps,
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
} from "@tiptap/react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { loadPdfJs } from "@/components/pdf-view";
import { buttonStyles, inputStyles } from "@/components/styles";
import { checkMath } from "@/lib/editor/math";
import { sanitizeLatex } from "@/lib/latex/sanitize";
import { BLOOM_LABEL, BLOOM_LEVELS, type Bloom } from "@/lib/paper/bloom";
import { CodeBlockView } from "./code-block";
import { CoTagInput } from "./co-tag-input";
import { useSubPartFields } from "./sub-part-fields";
import { MathField, MathText } from "./math";
import { COMMON_UNITS, unitLabel } from "./units";

const popoverStyles =
  "dx-popover z-50 flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-3 rounded-lg bg-surface p-3 shadow-sheet " +
  "origin-[var(--radix-popover-content-transform-origin)]";

const chip =
  "rounded px-0.5 outline-offset-1 hover:bg-sunk focus-visible:outline-2 focus-visible:outline-accent " +
  "data-[selected=true]:bg-accent-soft";

function Editable({
  trigger,
  children,
  open,
  onOpenChange,
  as = "span",
  selected,
}: {
  trigger: ReactNode;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  as?: "span" | "div";
  selected: boolean;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          contentEditable={false}
          data-selected={selected}
          className={`${chip} ${as === "div" ? "block w-full py-1" : "inline"}`}
        >
          {trigger}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={popoverStyles}
          sideOffset={6}
          align="start"
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Actions({
  onDone,
  onRemove,
  disabled,
}: {
  onDone: () => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" className={buttonStyles.danger} onClick={onRemove}>
        Remove
      </button>
      <button
        type="button"
        className={`${buttonStyles.primary} h-8 px-3 text-small`}
        onClick={onDone}
        disabled={disabled}
      >
        Done
      </button>
    </div>
  );
}

/** New nodes arrive empty and open at once; closing an empty one removes it. */
function useOpenWhenNew(isNew: boolean) {
  const [open, setOpen] = useState(isNew);
  return [open, setOpen] as const;
}

function MathView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const display = node.type.name === "mathDisplay";
  const latex = node.attrs.latex as string;
  const [open, setOpen] = useOpenWhenNew(latex === "");
  const [draft, setDraft] = useState(latex);
  const check = draft ? checkMath(draft) : null;
  const close = () => {
    setOpen(false);
    if (!latex) deleteNode();
    editor.commands.focus();
  };
  const done = () => {
    if (!check?.ok) return;
    updateAttributes({ latex: check.latex });
    setOpen(false);
    editor.commands.focus();
  };
  return (
    <NodeViewWrapper as={display ? "div" : "span"} className={display ? "my-1" : "inline"}>
      <Editable
        as={display ? "div" : "span"}
        selected={selected}
        open={open}
        onOpenChange={(o) => (o ? (setDraft(latex), setOpen(true)) : close())}
        trigger={
          latex ? (
            <MathText latex={latex} display={display} />
          ) : (
            <span className="text-ink-3">equation</span>
          )
        }
      >
        <MathField
          label={display ? "Equation on its own line" : "Equation"}
          value={latex}
          onChange={setDraft}
          onDone={done}
        />
        <p
          className={`text-caption wrap-anywhere ${check && !check.ok ? "text-danger" : "text-ink-3"}`}
          role="status"
        >
          {check && !check.ok
            ? check.message
            : "Type maths as you would say it: x^2, a/b, sqrt, alpha. Enter when done."}
        </p>
        <Actions
          onDone={done}
          onRemove={() => (setOpen(false), deleteNode())}
          disabled={!check?.ok}
        />
      </Editable>
    </NodeViewWrapper>
  );
}

/** Shown under Advanced LaTeX: what the allowed packages offer (D86-D90). */
const ADVANCED_EXAMPLES: Array<[string, string]> = [
  ["\\ce{2H2 + O2 -> 2H2O}", "reactions and formulae"],
  ["\\chemfig{*6(=-=-=-)}", "structures; bond options only as angle and length, e.g. -[:30]"],
  ["$\\prescript{14}{6}{C}$", "isotopes; also \\coloneqq and labelled arrows"],
  ["\\multirow{2}{*}{Dose}", "a cell over two table rows"],
  ["\\begin{enumerate}[label=(\\alph*), nosep]", "list labels and spacing"],
  ["\\textcolor{red}{text}", "named colours only"],
  ["\\begin{framed} … \\end{framed}", "a box around text"],
  ["\\rupee{}", "the rupee sign"],
];

function AdvancedView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const latex = node.attrs.latex as string;
  const [open, setOpen] = useOpenWhenNew(latex === "");
  const [draft, setDraft] = useState(latex);
  const id = useId();
  const check = draft.trim() ? sanitizeLatex(draft, "advanced") : null;
  const done = () => {
    if (!check?.ok) return;
    updateAttributes({ latex: draft });
    setOpen(false);
  };
  return (
    <NodeViewWrapper as="div" className="my-1">
      <Editable
        as="div"
        selected={selected}
        open={open}
        onOpenChange={(o) =>
          o ? (setDraft(latex), setOpen(true)) : (setOpen(false), !latex && deleteNode())
        }
        trigger={
          <span className="block rounded-md border border-dashed border-rule-strong px-2 py-1.5 text-left font-mono text-small text-ink-2">
            {latex || "Advanced LaTeX"}
          </span>
        }
      >
        <label htmlFor={id} className="text-small font-medium text-ink-2">
          Advanced LaTeX (checked before it reaches the paper)
        </label>
        <textarea
          id={id}
          value={draft}
          rows={6}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          className={`${inputStyles} h-auto py-2 font-mono text-small`}
        />
        <p
          className={`text-caption wrap-anywhere ${check && !check.ok ? "text-danger" : "text-ink-3"}`}
          role="status"
        >
          {check && !check.ok
            ? check.issues[0]?.message
            : check?.packages.length
              ? `Uses ${check.packages.join(", ")}; the paper loads ${check.packages.length === 1 ? "it" : "them"} for you.`
              : "File, shell and definition commands are refused."}
        </p>
        <details className="text-caption text-ink-3">
          <summary className="cursor-pointer text-ink-2">
            Chemistry, colour and list commands
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {ADVANCED_EXAMPLES.map(([code, what]) => (
              <li key={code}>
                <code className="font-mono text-ink-2">{code}</code> {what}
              </li>
            ))}
          </ul>
          <p className="mt-1.5">
            Pictures go in Insert › Picture. TikZ, pgfplots, listings and file commands are not
            available.
          </p>
        </details>
        <Actions
          onDone={done}
          onRemove={() => (setOpen(false), deleteNode())}
          disabled={!check?.ok}
        />
      </Editable>
    </NodeViewWrapper>
  );
}

function BlankView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const width = (node.attrs.widthCm as number | null) ?? 2.5;
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <NodeViewWrapper as="span" className="inline">
      <Editable
        selected={selected}
        open={open}
        onOpenChange={setOpen}
        trigger={
          <span
            aria-label={`Blank line, ${width} cm`}
            className="inline-block border-b border-ink align-baseline"
            style={{ width: `${Math.min(width, 12) * 0.6}rem`, height: "1em" }}
          />
        }
      >
        <label htmlFor={id} className="text-small font-medium text-ink-2">
          Length of the blank (cm)
        </label>
        <input
          id={id}
          type="number"
          min={0.5}
          max={15}
          step={0.5}
          defaultValue={width}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 0.5 && v <= 15) updateAttributes({ widthCm: v });
          }}
          className={`${inputStyles} w-28`}
        />
        <Actions onDone={() => setOpen(false)} onRemove={() => (setOpen(false), deleteNode())} />
      </Editable>
    </NodeViewWrapper>
  );
}

function UnitsView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const value = node.attrs.value as string;
  const unit = node.attrs.unit as string;
  const [open, setOpen] = useOpenWhenNew(unit === "");
  const [v, setV] = useState(value);
  const [u, setU] = useState(unit || (COMMON_UNITS[0]?.unit ?? ""));
  const valueOk = /^[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/.test(v);
  const unitOk = u.trim() !== "" && sanitizeLatex(u, "math").ok;
  const vid = useId();
  const uid = useId();
  const done = () => {
    if (!valueOk || !unitOk) return;
    updateAttributes({ value: v, unit: u });
    setOpen(false);
  };
  return (
    <NodeViewWrapper as="span" className="inline">
      <Editable
        selected={selected}
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : (setOpen(false), !unit && deleteNode()))}
        trigger={
          <span className="tabular-nums">
            {value}&thinsp;{unitLabel(unit)}
          </span>
        }
      >
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <label htmlFor={vid} className="text-small font-medium text-ink-2">
            Number
          </label>
          <label htmlFor={uid} className="text-small font-medium text-ink-2">
            Unit
          </label>
          <input
            id={vid}
            inputMode="decimal"
            value={v}
            aria-invalid={!valueOk}
            onChange={(e) => setV(e.target.value)}
            className={inputStyles}
          />
          <select
            id={uid}
            value={COMMON_UNITS.some((x) => x.unit === u) ? u : "other"}
            onChange={(e) => setU(e.target.value === "other" ? "" : e.target.value)}
            className={inputStyles}
          >
            {COMMON_UNITS.map((x) => (
              <option key={x.unit} value={x.unit}>
                {x.label}
              </option>
            ))}
            <option value="other">Other (siunitx)…</option>
          </select>
        </div>
        {!COMMON_UNITS.some((x) => x.unit === u) ? (
          <input
            aria-label="Unit in siunitx form"
            placeholder="\milli\gram\per\litre"
            value={u}
            aria-invalid={!unitOk}
            onChange={(e) => setU(e.target.value)}
            className={`${inputStyles} font-mono`}
          />
        ) : null}
        {!valueOk ? (
          <p className="text-caption text-danger">Use a plain number, like 2.5.</p>
        ) : null}
        <Actions
          onDone={done}
          onRemove={() => (setOpen(false), deleteNode())}
          disabled={!valueOk || !unitOk}
        />
      </Editable>
    </NodeViewWrapper>
  );
}

function ImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { sha256, ext } = node.attrs as { sha256: string; ext: string };
  const width = (node.attrs.widthPercent as number | null) ?? 60;
  const [open, setOpen] = useState(false);
  const id = useId();
  const src = `/api/assets/${sha256}.${ext}`;
  return (
    <NodeViewWrapper as="div" className="my-2 flex justify-center" data-drag-handle>
      <Editable
        as="div"
        selected={selected}
        open={open}
        onOpenChange={setOpen}
        trigger={
          <span className="mx-auto block" style={{ width: `${width}%` }}>
            {ext === "pdf" ? (
              <PdfThumb src={src} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- the user's own upload, served by this app
              <img
                src={src}
                alt="Picture in the question"
                className="block h-auto w-full bg-white"
              />
            )}
          </span>
        }
      >
        <label htmlFor={id} className="text-small font-medium text-ink-2">
          Width on the paper: {width}% of the line
        </label>
        <input
          id={id}
          type="range"
          min={10}
          max={100}
          step={5}
          value={width}
          onChange={(e) => updateAttributes({ widthPercent: Number(e.target.value) })}
          className="accent-accent"
        />
        <Actions onDone={() => setOpen(false)} onRemove={() => (setOpen(false), deleteNode())} />
      </Editable>
    </NodeViewWrapper>
  );
}

/** First page of a PDF drawing, drawn with the pdf.js the preview already loads. */
function PdfThumb({ src }: { src: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pdfjs = await loadPdfJs();
      const task = pdfjs.getDocument({ url: src });
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      if (!cancelled) setUrl(canvas.toDataURL("image/png"));
      await task.destroy();
    })().catch(() => !cancelled && setUrl(""));
    return () => {
      cancelled = true;
    };
  }, [src]);
  if (url === null) return <span className="block aspect-[4/3] w-full animate-pulse bg-sunk" />;
  if (url === "")
    return (
      <span className="block px-2 py-6 text-center text-small text-danger">
        This PDF drawing could not be shown.
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- rendered locally from the user's own PDF
    <img src={url} alt="PDF drawing in the question" className="block h-auto w-full bg-white" />
  );
}

const LETTERS = "ABCDEFGH";

function ChoicesView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const columns = (node.attrs.columns as number | null) ?? null;
  const count = node.childCount;
  const addChoice = () => {
    const pos = getPos();
    if (typeof pos !== "number" || count >= 8) return;
    const end = pos + node.nodeSize - 1;
    editor
      .chain()
      .insertContentAt(end, { type: "choice" })
      .setTextSelection(end + 1)
      .focus()
      .run();
  };
  return (
    <NodeViewWrapper as="div" className="my-2 rounded-md border border-rule px-2 pt-1 pb-2">
      <div
        contentEditable={false}
        className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-2"
      >
        <span className="font-semibold tracking-[0.06em] text-ink-3 uppercase">Choices</span>
        <label className="flex items-center gap-1">
          Columns
          <select
            value={columns ?? ""}
            onChange={(e) =>
              updateAttributes({ columns: e.target.value ? Number(e.target.value) : null })
            }
            className={`${inputStyles} h-7 px-1 text-caption`}
          >
            <option value="">As the group</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="4">4</option>
          </select>
        </label>
        <button
          type="button"
          className={`${buttonStyles.quiet} h-7`}
          onClick={addChoice}
          disabled={count >= 8}
        >
          Add choice
        </button>
        <span className="text-ink-3">Tick the correct answer for the key.</span>
      </div>
      <NodeViewContent as="div" role="list" className="flex flex-col" />
    </NodeViewWrapper>
  );
}

/** One option: its letter, a radio that marks it correct, and its text. */
function ChoiceView({ editor, getPos }: NodeViewProps) {
  // The answer lives on the parent choices node; follow it as it changes.
  const { index, correct, parentPos } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const pos = getPos();
      if (typeof pos !== "number") return { index: 0, correct: null, parentPos: null };
      const $pos = e.state.doc.resolve(pos);
      return {
        index: $pos.index(),
        correct: ($pos.parent.attrs.correct as number | null) ?? null,
        parentPos: $pos.depth > 0 ? $pos.before() : null,
      };
    },
  });
  const name = useId();
  const mark = () => {
    if (parentPos === null) return;
    editor
      .chain()
      .command(({ tr }) => {
        const parent = tr.doc.nodeAt(parentPos);
        if (!parent) return false;
        tr.setNodeMarkup(parentPos, undefined, { ...parent.attrs, correct: index });
        return true;
      })
      .run();
  };
  return (
    <NodeViewWrapper as="div" role="listitem" className="flex items-baseline gap-2">
      <span contentEditable={false} className="flex shrink-0 items-center gap-1 select-none">
        <input
          type="radio"
          name={name}
          checked={correct === index}
          onChange={mark}
          aria-label={`${LETTERS[index]} is the correct answer`}
          className="accent-accent"
        />
        <span className="w-5 font-paper font-semibold whitespace-nowrap">{LETTERS[index]}.</span>
      </span>
      <NodeViewContent as="div" className="min-w-0 flex-1" />
    </NodeViewWrapper>
  );
}

/**
 * One sub-part: its letter, its text and, inside a question, its own marks,
 * CO tag and Bloom level (D65). Unset values follow the question's (D66,
 * shown as "As question"); only differing values print on the sub-part (D67).
 */
function SubPartView({ editor, getPos, node, updateAttributes }: NodeViewProps) {
  const f = useSubPartFields();
  const index = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const pos = getPos();
      return typeof pos === "number" ? e.state.doc.resolve(pos).index() : 0;
    },
  });
  const letter = `(${String.fromCharCode(97 + index)})`;
  const a = node.attrs as { marks: number | null; coTag: string | null; bloom: Bloom | null };
  const name = f ? `${f.questionName} ${letter}` : letter;
  const id = useId();
  const [open, setOpen] = useState(false);
  const asQuestion = (v: string | null | undefined) => (v ? `As question (${v})` : "As question");
  const bloomOf = (b: Bloom | null) => (b ? BLOOM_LABEL[b] : null);
  // One short line under the text; the fields open in a popover (narrow columns).
  const facts = [
    a.marks != null ? `${a.marks} ${a.marks === 1 ? "mark" : "marks"}` : "No marks",
    f?.showCo ? (a.coTag ?? `CO as question${f.questionCo ? ` (${f.questionCo})` : ""}`) : null,
    bloomOf(a.bloom) ??
      `Bloom as question${f?.questionBloom ? ` (${bloomOf(f.questionBloom)})` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <NodeViewWrapper as="div" role="listitem" className="flex items-baseline gap-2">
      <span contentEditable={false} className="w-6 shrink-0 font-paper select-none">
        {letter}
      </span>
      <div className="min-w-0 flex-1">
        <NodeViewContent as="div" />
        {f ? (
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                contentEditable={false}
                aria-label={`Marks, CO and Bloom for ${name}: ${facts}`}
                className="mb-1 max-w-full rounded px-1 text-left font-sans text-caption text-ink-2 select-none hover:bg-sunk hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                {facts}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className={`${popoverStyles} w-[min(20rem,calc(100vw-2rem))]`}
                sideOffset={4}
                align="start"
                collisionPadding={12}
                aria-label={`Marks, CO and Bloom for ${name}`}
              >
                <p className="text-small font-medium text-ink">{name}</p>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-small text-ink-2">
                  <label htmlFor={`${id}-m`}>Marks</label>
                  <input
                    id={`${id}-m`}
                    type="number"
                    min={0.5}
                    max={100}
                    step={0.5}
                    value={a.marks ?? ""}
                    placeholder="None"
                    aria-label={`Marks for ${name}`}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      updateAttributes({ marks: e.target.value && n > 0 && n <= 100 ? n : null });
                    }}
                    className={`${inputStyles} w-24 text-right tabular-nums`}
                  />
                  {f.showCo ? (
                    <>
                      <label htmlFor={`${id}-c`}>CO</label>
                      <CoTagInput
                        id={`${id}-c`}
                        label={`CO tag for ${name}`}
                        value={a.coTag ?? null}
                        placeholder={f.questionCo ? `${f.questionCo} (as question)` : "As question"}
                        options={f.coOptions}
                        onChange={(coTag) => updateAttributes({ coTag })}
                        className={inputStyles}
                      />
                    </>
                  ) : null}
                  <label htmlFor={`${id}-b`}>Bloom</label>
                  <select
                    id={`${id}-b`}
                    aria-label={`Bloom level for ${name}`}
                    value={a.bloom ?? ""}
                    onChange={(e) =>
                      updateAttributes({ bloom: (e.target.value || null) as Bloom | null })
                    }
                    className={inputStyles}
                  >
                    <option value="">{asQuestion(bloomOf(f.questionBloom))}</option>
                    {BLOOM_LEVELS.map((v) => (
                      <option key={v} value={v}>
                        {BLOOM_LABEL[v]}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-caption text-ink-3">
                  “As question” follows the question’s own CO and level.
                </p>
                <div className="flex justify-end">
                  <Popover.Close className={buttonStyles.secondary}>Done</Popover.Close>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}

export const VIEWS = {
  codeBlock: CodeBlockView,
  subPart: SubPartView,
  mathInline: MathView,
  mathDisplay: MathView,
  advancedLatex: AdvancedView,
  blank: BlankView,
  units: UnitsView,
  image: ImageView,
  choices: ChoicesView,
  choice: ChoiceView,
};
