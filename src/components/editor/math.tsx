"use client";
// Equations: static rendering for reading, and MathLive's <math-field> for
// typing. MathLive's fonts come from its own stylesheet, bundled by Next, so
// the element is told not to fetch fonts or sounds itself (D27).
import "mathlive/fonts.css";
import "mathlive/static.css";
import { convertLatexToMarkup } from "mathlive";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

export function MathText({ latex, display = false }: { latex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      // MathLive builds this markup from the LaTeX itself; nothing the user
      // typed is inserted as HTML.
      return convertLatexToMarkup(latex || "\\square", {
        defaultMode: display ? "math" : "inline-math",
      });
    } catch {
      return null;
    }
  }, [latex, display]);
  if (html === null) return <code className="text-small text-danger">{latex}</code>;
  return (
    <span
      className={display ? "block text-center" : "inline-block align-middle"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface MathFieldElement extends HTMLElement {
  value: string;
  getValue(format: "latex-expanded"): string;
  focus(): void;
  menuItems: unknown[];
  mathVirtualKeyboardPolicy: string;
  smartFence: boolean;
}

let configured = false;

/** An editable equation. `onChange` gets MathLive's LaTeX on every keystroke. */
export function MathField({
  value,
  onChange,
  onDone,
  label,
}: {
  value: string;
  onChange: (latex: string) => void;
  onDone?: () => void;
  label: string;
}) {
  const ref = useRef<MathFieldElement | null>(null);
  const changeRef = useRef(onChange);
  const doneRef = useRef(onDone);
  useLayoutEffect(() => {
    changeRef.current = onChange;
    doneRef.current = onDone;
  });

  useEffect(() => {
    let cancelled = false;
    void import("mathlive").then(async ({ MathfieldElement }) => {
      if (!configured) {
        MathfieldElement.fontsDirectory = null;
        MathfieldElement.soundsDirectory = null;
        configured = true;
      }
      // Focus only once the element is upgraded, or the first keys are lost.
      await customElements.whenDefined("math-field");
      const el = ref.current;
      if (!el || cancelled) return;
      // No colour menu: colours are not printed on question papers.
      el.menuItems = [];
      el.smartFence = false;
      el.mathVirtualKeyboardPolicy = "auto";
      el.value = value;
      requestAnimationFrame(() => el.focus());
    });
    return () => {
      cancelled = true;
    };
    // Only the first value seeds the field; later ones come from typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const input = () => changeRef.current(el.getValue("latex-expanded"));
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doneRef.current?.();
      }
    };
    el.addEventListener("input", input);
    el.addEventListener("keydown", keydown);
    return () => {
      el.removeEventListener("input", input);
      el.removeEventListener("keydown", keydown);
    };
  }, []);

  return (
    <math-field
      ref={ref as never}
      aria-label={label}
      class="block min-h-11 w-full rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-lead text-ink focus-within:outline-2 focus-within:outline-accent"
    />
  );
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- JSX intrinsic for the web component
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        class?: string;
      };
    }
  }
}
