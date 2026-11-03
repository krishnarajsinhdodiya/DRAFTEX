// Shared class names. Kept out of "use client" modules: a server component
// that imports a plain value from one receives undefined, not the value.
// Colours are the role tokens from globals.css; none of these names a hue.
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const buttonBase =
  "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-4 text-body font-medium " +
  "transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97] " +
  `${focusRing} disabled:opacity-60 disabled:active:scale-100`;

export const buttonStyles = {
  primary: `${buttonBase} bg-accent text-on-accent hover:bg-accent-hover`,
  secondary: `${buttonBase} border border-rule-strong bg-surface text-ink hover:bg-sunk`,
  quiet: `${buttonBase} h-8 px-2.5 text-small text-ink-2 hover:bg-sunk hover:text-ink`,
  danger: `${buttonBase} h-8 px-2.5 text-small text-danger hover:bg-danger-soft`,
};

/** Text inputs and selects share one shape. */
export const inputStyles =
  "h-9 rounded-md border border-rule-strong bg-surface px-2.5 text-body text-ink placeholder:text-ink-3 " +
  "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent " +
  "aria-invalid:border-danger";

export const linkStyles = `rounded-sm text-accent underline-offset-2 hover:underline ${focusRing}`;

/** A sheet of paper on the desk: lists, panels and the editor's slot cards. */
export const sheetStyles = "rounded-lg bg-surface shadow-sheet";

/** Page title in the paper voice. */
export const pageTitleStyles = "font-paper text-display font-semibold text-ink";

/** Small uppercase label above a group of fields or a list. */
export const eyebrowStyles = "text-caption font-semibold tracking-[0.06em] text-ink-3 uppercase";
