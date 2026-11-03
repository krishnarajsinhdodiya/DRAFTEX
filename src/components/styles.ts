// Shared class names. Kept out of "use client" modules: a server component
// that imports a plain value from one receives undefined, not the value.
const buttonBase =
  "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-4 text-[15px] font-medium " +
  "transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 disabled:active:scale-100";

export const buttonStyles = {
  primary: `${buttonBase} bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500`,
  secondary: `${buttonBase} border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800`,
  quiet: `${buttonBase} h-8 px-2.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800`,
  danger: `${buttonBase} h-8 px-2.5 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950`,
};
