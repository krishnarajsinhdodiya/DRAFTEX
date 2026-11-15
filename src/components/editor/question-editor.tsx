"use client";
// One question's editor: TipTap with the paper's own nodes, a toolbar, a "/"
// menu and picture upload by button, drag or paste. It reports stored-form
// content on every change; saving is the caller's job.
import type { Editor, Range } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { EditorContent, ReactNodeViewRenderer, useEditor, useEditorState } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import {
  Bold,
  Code as CodeIcon,
  Italic,
  Plus,
  Redo2,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { type EditorNode, fromStored, toStored } from "@/lib/editor/convert";
import { questionSchemaExtensions } from "@/lib/editor/nodes";
import type { Doc } from "@/lib/paper/schema";
import { type Insert, defaultWidthPercent, matchInserts } from "./inserts";
import { TableBar } from "./table-bar";
import { VIEWS } from "./views";

export interface UploadedImage {
  sha256: string;
  ext: "png" | "jpg" | "pdf";
  width: number;
}
export type Uploader = (file: File) => Promise<UploadedImage>;

// ---------- "/" menu state, shared between the plugin and React ----------

interface SlashState {
  items: Insert[];
  index: number;
  rect: DOMRect | null;
  command: ((item: Insert) => void) | null;
}
function slashStore() {
  let state: SlashState = { items: [], index: 0, rect: null, command: null };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: Partial<SlashState>) {
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
type SlashStore = ReturnType<typeof slashStore>;

function slashExtension(store: SlashStore, allowAdvanced: () => boolean, onFile: () => void) {
  return Extension.create({
    name: "slashMenu",
    addProseMirrorPlugins() {
      return [
        Suggestion<Insert, Insert>({
          editor: this.editor,
          char: "/",
          startOfLine: false,
          items: ({ query }) => matchInserts(query, allowAdvanced()),
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range as Range)
              .run();
            if (props.needsFile) onFile();
            else props.run(editor);
          },
          render: () => {
            const show = (p: SuggestionProps<Insert, Insert>) =>
              store.set({
                items: p.items,
                rect: p.clientRect?.() ?? null,
                command: (item) => p.command(item),
                index: Math.min(store.get().index, Math.max(0, p.items.length - 1)),
              });
            return {
              onStart: (p) => {
                store.set({ index: 0 });
                show(p);
              },
              onUpdate: show,
              onKeyDown: ({ event }) => {
                const s = store.get();
                if (!s.items.length) return false;
                if (event.key === "ArrowDown") {
                  store.set({ index: (s.index + 1) % s.items.length });
                  return true;
                }
                if (event.key === "ArrowUp") {
                  store.set({ index: (s.index - 1 + s.items.length) % s.items.length });
                  return true;
                }
                if (event.key === "Enter") {
                  const item = s.items[s.index];
                  if (item) s.command?.(item);
                  return true;
                }
                if (event.key === "Escape") {
                  store.set({ items: [], rect: null });
                  return true;
                }
                return false;
              },
              onExit: () => store.set({ items: [], rect: null, command: null }),
            };
          },
        }),
      ];
    },
  });
}

function SlashMenu({ store }: { store: SlashStore }) {
  const s = useSyncExternalStore(store.subscribe, store.get, store.get);
  if (!s.rect || s.items.length === 0) return null;
  return createPortal(
    <div
      role="listbox"
      aria-label="Insert"
      className="fixed z-50 w-64 overflow-hidden rounded-lg bg-surface py-1 shadow-sheet"
      style={{ left: s.rect.left, top: s.rect.bottom + 6 }}
    >
      {s.items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={i === s.index}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => s.command?.(item)}
          className="block w-full px-3 py-1.5 text-left text-small text-ink aria-selected:bg-accent-soft"
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ---------- the editor ----------

const QUESTION_PLACEHOLDER = "Type the question. Press / to insert an equation, table or picture.";

function extensions(
  store: SlashStore,
  allowAdvanced: () => boolean,
  onFile: () => void,
  placeholder: string,
) {
  return [
    ...questionSchemaExtensions().map((ext) => {
      const view = VIEWS[ext.name as keyof typeof VIEWS];
      return view ? ext.extend({ addNodeView: () => ReactNodeViewRenderer(view) }) : ext;
    }),
    UndoRedo.configure({ depth: 100, newGroupDelay: 600 }),
    Placeholder.configure({ placeholder }),
    slashExtension(store, allowAdvanced, onFile),
  ];
}

function ToolButton({
  label,
  active,
  onClick,
  children,
  disabled,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-sunk hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 aria-pressed:bg-accent-soft aria-pressed:text-accent"
    >
      {children}
    </button>
  );
}

/** The editor the shared toolbar acts on, and how to ask it for a picture. */
export interface EditorHandle {
  editor: Editor;
  pickFile: () => void;
}

export function Toolbar({
  editor,
  allowAdvanced,
  onFile,
}: {
  editor: Editor;
  allowAdvanced: boolean;
  onFile: () => void;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      sub: e.isActive("subscript"),
      sup: e.isActive("superscript"),
      code: e.isActive("code"),
      table: e.isActive("table"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const [open, setOpen] = useState(false);
  const c = () => editor.chain().focus();
  return (
    <div
      role="toolbar"
      aria-label="Question formatting"
      className="flex flex-wrap items-center gap-0.5"
    >
      <ToolButton label="Bold (Ctrl+B)" active={s.bold} onClick={() => c().toggleBold().run()}>
        <Bold size={16} aria-hidden />
      </ToolButton>
      <ToolButton
        label="Italic (Ctrl+I)"
        active={s.italic}
        onClick={() => c().toggleItalic().run()}
      >
        <Italic size={16} aria-hidden />
      </ToolButton>
      <ToolButton
        label="Underline (Ctrl+U)"
        active={s.underline}
        onClick={() => c().toggleUnderline().run()}
      >
        <UnderlineIcon size={16} aria-hidden />
      </ToolButton>
      <ToolButton label="Subscript" active={s.sub} onClick={() => c().toggleSubscript().run()}>
        <SubIcon size={16} aria-hidden />
      </ToolButton>
      <ToolButton label="Superscript" active={s.sup} onClick={() => c().toggleSuperscript().run()}>
        <SupIcon size={16} aria-hidden />
      </ToolButton>
      <ToolButton
        label="Inline code (Ctrl+E)"
        active={s.code}
        onClick={() => c().toggleMark("code").run()}
      >
        <CodeIcon size={16} aria-hidden />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-rule" aria-hidden />
      <div className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-small font-medium text-ink-2 hover:bg-sunk hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Plus size={16} aria-hidden /> Insert
        </button>
        {open ? (
          <div
            role="menu"
            className="absolute left-0 top-9 z-40 w-60 rounded-lg bg-surface py-1 shadow-sheet"
          >
            {matchInserts("", allowAdvanced).map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  if (item.needsFile) onFile();
                  else item.run(editor);
                }}
                className="block w-full px-3 py-1.5 text-left text-small text-ink hover:bg-sunk focus-visible:bg-sunk focus-visible:outline-none"
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <span className="ml-auto" />
      <ToolButton label="Undo (Ctrl+Z)" disabled={!s.undo} onClick={() => c().undo().run()}>
        <Undo2 size={16} aria-hidden />
      </ToolButton>
      <ToolButton label="Redo (Ctrl+Shift+Z)" disabled={!s.redo} onClick={() => c().redo().run()}>
        <Redo2 size={16} aria-hidden />
      </ToolButton>
      {s.table ? <TableBar editor={editor} /> : null}
    </div>
  );
}

interface Bridge {
  onChange: (doc: Doc) => void;
  onProblem: (message: string | null) => void;
  upload: Uploader;
  allowAdvanced: boolean;
  editor: Editor | null;
  pickFile: () => void;
  setUploading: (v: boolean) => void;
}

async function insertFiles(b: Bridge, files: File[], at?: number) {
  const editor = b.editor;
  if (!editor || files.length === 0) return;
  b.setUploading(true);
  b.onProblem(null);
  try {
    for (const file of files) {
      const img = await b.upload(file);
      const node = {
        type: "image",
        attrs: { sha256: img.sha256, ext: img.ext, widthPercent: defaultWidthPercent(img) },
      };
      const chain = editor.chain().focus();
      (at === undefined ? chain.insertContent(node) : chain.insertContentAt(at, node)).run();
    }
  } catch (e) {
    b.onProblem(e instanceof Error ? e.message : "The picture could not be added.");
  } finally {
    b.setUploading(false);
  }
}

function editorOptions(
  store: SlashStore,
  ref: { current: Bridge },
  initial: Doc,
  label: string,
  placeholder: string,
): Parameters<typeof useEditor>[0] {
  return {
    // Rendered only in the browser, after a click: create the editor at once so
    // the first keys typed after the click land in it.
    immediatelyRender: true,
    extensions: extensions(
      store,
      () => ref.current.allowAdvanced,
      () => ref.current.pickFile(),
      placeholder,
    ),
    content: fromStored(initial),
    editorProps: {
      attributes: {
        class: "dx-question min-h-16 px-3 py-2 text-body text-ink focus:outline-none",
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.length) return false;
        void insertFiles(ref.current, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (!files.length) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertFiles(ref.current, files, at);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const r = toStored(e.getJSON() as EditorNode);
      if (r.ok) {
        ref.current.onProblem(null);
        ref.current.onChange(r.doc);
      } else {
        ref.current.onProblem(r.message);
      }
    },
  };
}

export function QuestionEditor({
  initial,
  onChange,
  onProblem,
  upload,
  allowAdvanced,
  label,
  placeholder = QUESTION_PLACEHOLDER,
  onFocus,
}: {
  initial: Doc;
  /** Shown while the editor is empty. */
  placeholder?: string;
  onChange: (doc: Doc) => void;
  /** This editor took the focus; the paper's toolbar follows it. */
  onFocus?: (handle: EditorHandle) => void;
  /** A change the paper cannot hold, or an upload that failed. */
  onProblem: (message: string | null) => void;
  upload: Uploader;
  allowAdvanced: boolean;
  label: string;
}) {
  const [store] = useState(slashStore);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Callbacks TipTap keeps for the editor's lifetime read the latest props here.
  const bridgeRef = useRef<Bridge>({
    onChange,
    onProblem,
    upload,
    allowAdvanced,
    editor: null,
    pickFile: () => fileRef.current?.click(),
    setUploading,
  });
  useLayoutEffect(() => {
    Object.assign(bridgeRef.current, { onChange, onProblem, upload, allowAdvanced });
  });

  // TipTap calls these only from editor events, never while rendering; the
  // compiler cannot see that, so the one place that hands over the ref says so.
  // eslint-disable-next-line react-hooks/refs
  const editor = useEditor(editorOptions(store, bridgeRef, initial, label, placeholder));
  useEffect(() => {
    bridgeRef.current.editor = editor;
  }, [editor]);

  // Focus before the first paint, so keys typed straight after the click land here.
  useLayoutEffect(() => {
    if (editor && !editor.isFocused) editor.commands.focus("end");
  }, [editor]);
  useEffect(() => {
    // Load the equation editor early, so the first equation opens ready to type.
    void import("mathlive");
  }, []);

  const focusRef = useRef(onFocus);
  useLayoutEffect(() => {
    focusRef.current = onFocus;
  });
  useEffect(() => {
    if (!editor) return;
    const tell = () => focusRef.current?.({ editor, pickFile: () => bridgeRef.current.pickFile() });
    editor.on("focus", tell);
    if (editor.isFocused) tell();
    return () => {
      editor.off("focus", tell);
    };
  }, [editor]);

  if (!editor) return <div className="min-h-16 px-3 py-2 text-ink-3">Opening the question…</div>;
  return (
    <div className="flex flex-col">
      <EditorContent editor={editor} />
      <SlashMenu store={store} />
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,application/pdf,image/svg+xml,.svg"
        onChange={(e) => {
          void insertFiles(bridgeRef.current, [...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {uploading ? (
        <p role="status" className="px-3 pb-2 text-caption text-ink-2">
          Adding the picture…
        </p>
      ) : null}
    </div>
  );
}
