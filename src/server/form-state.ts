/** What a form action returns to its form. */
export interface FormState {
  /** A message for the whole form. */
  error?: string;
  /** Messages per field name. */
  fields?: Record<string, string>;
  /** Values to show again after an error (never passwords). */
  values?: Record<string, string>;
  /** A success message. */
  notice?: string;
  /** A new invite code, shown once. */
  code?: string;
  expiresAt?: string;
}

export const emptyForm: FormState = {};
