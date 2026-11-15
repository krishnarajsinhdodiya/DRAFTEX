"use client";
// The table's own controls (D105), shown under the toolbar while the cursor
// is in a table: rows and columns, merge and split, header row, borders, and
// a Columns popover for alignment and widths. Problems that would stop the
// paper (D107) show here as they happen, worded as the server words them.
import type { Editor } from "@tiptap/core";
import { findTable, selectedRect } from "@tiptap/pm/tables";
import { useEditorState } from "@tiptap/react";
import * as Popover from "@radix-ui/react-popover";
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Columns3,
  PanelTop,
  TableCellsMerge,
  TableCellsSplit,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash,
} from "lucide-react";
import { type ReactNode, useId } from "react";
import { type EditorNode, toStored } from "@/lib/editor/convert";
import { TABLE_LIMITS, checkTable } from "@/lib/latex/table";
import type { TableColumn, TableNode } from "@/lib/paper/schema";
import { popoverStyles } from "./views";

type Column = TableColumn;
type Align = NonNullable<Column["align"]>;

interface TableState {
  rows: number;
  cols: number;
  columns: Column[];
  borders: "BOOKTABS" | "GRID";
  widthPercent: number;
  headerRow: boolean;
  canMerge: boolean;
  canSplit: boolean;
  problems: string[];
}

function readTable(editor: Editor): TableState | null {
  const found = findTable(editor.state.selection.$from);
  if (!found) return null;
  const { node } = found;
  let rows = 0;
  let cols = 0;
  try {
    const rect = selectedRect(editor.state);
    rows = rect.map.height;
    cols = rect.map.width;
  } catch {
    return null;
  }
  const given = (node.attrs.columns ?? []) as (Column | null)[];
  const columns = Array.from({ length: cols }, (_, i) => ({ ...(given[i] ?? {}) }));
  const stored = toStored({ type: "doc", content: [node.toJSON() as EditorNode] });
  const problems =
    stored.ok && stored.doc.content[0]?.type === "table"
      ? checkTable(stored.doc.content[0] as TableNode)
      : stored.ok
        ? []
        : [stored.message];
  const first = node.firstChild;
  let headerRow = first !== null && first.childCount > 0;
  first?.forEach((c) => {
    if (c.type.name !== "tableHeader") headerRow = false;
  });
  return {
    rows,
    cols,
    columns,
    borders: node.attrs.borders === "GRID" ? "GRID" : "BOOKTABS",
    widthPercent: Number(node.attrs.widthPercent ?? 80),
    headerRow,
    canMerge: editor.can().mergeCells(),
    canSplit: editor.can().splitCell(),
    problems,
  };
}

/** Writes the table's own attributes in one step (undoable), keeping the cursor where it is. */
function setTable(editor: Editor, patch: Record<string, unknown>) {
  const found = findTable(editor.state.selection.$from);
  if (!found) return;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...patch }),
  );
}

const hasWidths = (cols: Column[]) => cols.length > 0 && cols.every((c) => c.width !== undefined);

/** Column settings after inserting one at `at`: it takes half of its neighbour's width. */
export function insertColumn(cols: Column[], at: number): Column[] {
  const next = cols.map((c) => ({ ...c }));
  const fresh: Column = {};
  if (hasWidths(cols)) {
    const n = Math.min(Math.max(at - 1, 0), next.length - 1);
    const w = next[n]?.width ?? 0;
    if (w >= 2 * TABLE_LIMITS.minWidth) {
      fresh.width = Math.floor(w / 2);
      (next[n] as Column).width = w - fresh.width;
    } else {
      for (const c of next) delete c.width;
    }
  }
  next.splice(at, 0, fresh);
  return next;
}

/** Column settings after deleting columns [from, to): a neighbour takes their width. */
export function deleteColumns(cols: Column[], from: number, to: number): Column[] {
  const removed = cols.slice(from, to).reduce((a, c) => a + (c.width ?? 0), 0);
  const next = cols.filter((_, i) => i < from || i >= to).map((c) => ({ ...c }));
  if (hasWidths(cols) && next.length) {
    const n = Math.min(Math.max(from - 1, 0), next.length - 1);
    (next[n] as Column).width = ((next[n] as Column).width ?? 0) + removed;
  }
  return next;
}

/** Whole-number widths that add up to 100, the remainder on the first columns. */
export function equalWidths(n: number): number[] {
  const base = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => base + (i < 100 - base * n ? 1 : 0));
}

function Btn({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-sunk hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 aria-pressed:bg-accent-soft aria-pressed:text-accent"
    >
      {children}
    </button>
  );
}

const sep = <span className="mx-1 h-5 w-px bg-rule" aria-hidden />;

export function TableBar({ editor }: { editor: Editor }) {
  const s = useEditorState({ editor, selector: ({ editor: e }) => readTable(e) });
  if (!s) return null;
  const run = (f: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) =>
    f(editor.chain().focus()).run();

  const addColumn = (after: boolean) => {
    const rect = selectedRect(editor.state);
    const at = after ? rect.right : rect.left;
    const cols = s.columns;
    if (run((c) => (after ? c.addColumnAfter() : c.addColumnBefore()))) {
      setTable(editor, { columns: insertColumn(cols, at) });
    }
  };
  const removeColumn = () => {
    const rect = selectedRect(editor.state);
    const cols = s.columns;
    if (s.cols - (rect.right - rect.left) < 1) {
      run((c) => c.deleteTable());
      return;
    }
    if (run((c) => c.deleteColumn()))
      setTable(editor, { columns: deleteColumns(cols, rect.left, rect.right) });
  };

  return (
    <div className="flex w-full basis-full flex-col gap-1 border-t border-rule pt-1">
      <div role="toolbar" aria-label="Table" className="flex flex-wrap items-center gap-0.5">
        <span className="mr-1 text-caption font-medium text-ink-3">Table</span>
        <Btn
          label="Add a row above"
          disabled={s.rows >= TABLE_LIMITS.rows}
          onClick={() => run((c) => c.addRowBefore())}
        >
          <BetweenHorizontalStart size={16} aria-hidden />
        </Btn>
        <Btn
          label="Add a row below"
          disabled={s.rows >= TABLE_LIMITS.rows}
          onClick={() => run((c) => c.addRowAfter())}
        >
          <BetweenHorizontalEnd size={16} aria-hidden />
        </Btn>
        <Btn
          label="Delete this row"
          onClick={() => run((c) => (s.rows > 1 ? c.deleteRow() : c.deleteTable()))}
        >
          <span className="text-caption font-semibold" aria-hidden>
            −R
          </span>
        </Btn>
        {sep}
        <Btn
          label="Add a column on the left"
          disabled={s.cols >= TABLE_LIMITS.columns}
          onClick={() => addColumn(false)}
        >
          <BetweenVerticalStart size={16} aria-hidden />
        </Btn>
        <Btn
          label="Add a column on the right"
          disabled={s.cols >= TABLE_LIMITS.columns}
          onClick={() => addColumn(true)}
        >
          <BetweenVerticalEnd size={16} aria-hidden />
        </Btn>
        <Btn label="Delete this column" onClick={removeColumn}>
          <span className="text-caption font-semibold" aria-hidden>
            −C
          </span>
        </Btn>
        {sep}
        <Btn
          label="Merge the selected cells (drag across cells, or Shift+click, to select)"
          disabled={!s.canMerge}
          onClick={() => run((c) => c.mergeCells())}
        >
          <TableCellsMerge size={16} aria-hidden />
        </Btn>
        <Btn
          label="Split the merged cell"
          disabled={!s.canSplit}
          onClick={() => run((c) => c.splitCell())}
        >
          <TableCellsSplit size={16} aria-hidden />
        </Btn>
        {sep}
        <Btn
          label="Header row"
          pressed={s.headerRow}
          onClick={() => run((c) => c.toggleHeaderRow())}
        >
          <PanelTop size={16} aria-hidden />
        </Btn>
        <div
          role="radiogroup"
          aria-label="Borders"
          className="ml-1 inline-flex rounded-md bg-sunk p-0.5"
        >
          {(
            [
              [
                "BOOKTABS",
                "Lines",
                "Rules above, below and under the header, as on printed papers",
              ],
              ["GRID", "Grid", "A line around every cell"],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={s.borders === value}
              aria-label={label}
              title={hint}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTable(editor, { borders: value === "GRID" ? "GRID" : null })}
              className="h-7 rounded px-2 text-caption font-medium text-ink-2 aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-sm focus-visible:outline-2 focus-visible:outline-accent"
            >
              {label}
            </button>
          ))}
        </div>
        <ColumnsPopover editor={editor} s={s} />
        <span className="ml-auto" />
        <Btn label="Delete the table" onClick={() => run((c) => c.deleteTable())}>
          <Trash size={16} aria-hidden />
        </Btn>
      </div>
      {s.problems.length ? (
        <ul role="status" className="px-1 pb-1 text-caption text-danger">
          {s.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const ALIGNS: [Align, string, typeof TextAlignStart][] = [
  ["LEFT", "Left", TextAlignStart],
  ["CENTER", "Centre", TextAlignCenter],
  ["RIGHT", "Right", TextAlignEnd],
];

function ColumnsPopover({ editor, s }: { editor: Editor; s: TableState }) {
  const id = useId();
  const setColumns = (columns: Column[]) => setTable(editor, { columns });
  const setColumn = (i: number, patch: Partial<Column>) =>
    setColumns(
      s.columns.map((c, j) => {
        if (j !== i) return c;
        const next: Column = { ...c, ...patch };
        if (patch.width === undefined && "width" in patch) delete next.width;
        return next;
      }),
    );
  const total = s.columns.reduce((a, c) => a + (c.width ?? 0), 0);
  const anyWidth = s.columns.some((c) => c.width !== undefined);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          className="ml-1 inline-flex h-8 items-center gap-1 rounded-md px-2 text-small font-medium text-ink-2 hover:bg-sunk hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Columns3 size={16} aria-hidden /> Columns
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={`${popoverStyles} max-h-[var(--radix-popover-content-available-height)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto`}
          sideOffset={6}
          align="start"
          collisionPadding={12}
          aria-label="Columns"
        >
          <div className="flex items-center justify-between gap-2 pb-2">
            <label htmlFor={`${id}-tw`} className="text-small font-medium text-ink">
              Table width
            </label>
            <span className="inline-flex items-center gap-1 text-small text-ink-2">
              <input
                id={`${id}-tw`}
                type="number"
                min={20}
                max={100}
                step={5}
                value={s.widthPercent}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v >= 20 && v <= 100) setTable(editor, { widthPercent: v });
                }}
                className="h-8 w-16 rounded-md border border-rule bg-surface px-2 text-right tabular-nums text-ink"
              />
              % of the line
            </span>
          </div>
          <table className="w-full text-small">
            <thead>
              <tr className="text-caption text-ink-3">
                <th className="py-1 text-left font-medium">Column</th>
                <th className="py-1 text-left font-medium">Align</th>
                <th className="py-1 text-right font-medium">Width</th>
              </tr>
            </thead>
            <tbody>
              {s.columns.map((c, i) => (
                <tr key={i}>
                  <td className="py-1 text-ink-2 tabular-nums">{i + 1}</td>
                  <td className="py-1">
                    <div
                      role="radiogroup"
                      aria-label={`Column ${i + 1} alignment`}
                      className="inline-flex rounded-md bg-sunk p-0.5"
                    >
                      {ALIGNS.map(([value, label, Icon]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={(c.align ?? "LEFT") === value}
                          aria-label={label}
                          title={label}
                          onClick={() =>
                            setColumn(i, { align: value === "LEFT" ? undefined : value })
                          }
                          className="inline-flex size-7 items-center justify-center rounded text-ink-2 aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-sm focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <Icon size={14} aria-hidden />
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="py-1 text-right">
                    <span className="inline-flex items-center gap-1 text-ink-2">
                      <input
                        type="number"
                        aria-label={`Column ${i + 1} width`}
                        min={TABLE_LIMITS.minWidth}
                        max={100}
                        placeholder="auto"
                        value={c.width ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setColumn(i, { width: raw === "" ? undefined : Math.round(Number(raw)) });
                        }}
                        className="h-8 w-16 rounded-md border border-rule bg-surface px-2 text-right tabular-nums text-ink placeholder:text-ink-3"
                      />
                      %
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-2 border-t border-rule pt-2 text-small">
            <span
              className={anyWidth && total !== 100 ? "text-danger" : "text-ink-2"}
              aria-live="polite"
            >
              {anyWidth ? `Total ${total}% of the table` : "Equal widths"}
            </span>
            <button
              type="button"
              onClick={() => {
                const w = equalWidths(s.cols);
                setColumns(s.columns.map((c, i) => ({ ...c, width: w[i] as number })));
              }}
              className="rounded-md px-2 py-1 font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
            >
              Set equal widths
            </button>
            {anyWidth ? (
              <button
                type="button"
                onClick={() =>
                  setColumns(s.columns.map((c) => (c.align ? { align: c.align } : {})))
                }
                className="rounded-md px-2 py-1 font-medium text-ink-2 hover:bg-sunk focus-visible:outline-2 focus-visible:outline-accent"
              >
                Clear
              </button>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
