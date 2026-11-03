// Patches name only the fields they change. Zod 4 fills `.default()` values
// even inside `.partial()`, so a parsed patch is trimmed back to the fields
// the caller actually sent; otherwise every unnamed field would be reset.
import type { z } from "zod";

export function parsePatch<S extends z.ZodType<Record<string, unknown>>>(
  schema: S,
  patch: object,
): Partial<z.output<S>> {
  const parsed = schema.parse(patch);
  return Object.fromEntries(
    Object.entries(parsed).filter(([k]) => Object.hasOwn(patch, k)),
  ) as Partial<z.output<S>>;
}
