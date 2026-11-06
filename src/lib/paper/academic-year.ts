// "Duplicate as… next academic year" (D60). Academic year is free text on a
// paper; only the two forms the college writes are understood. Client-safe.

/** `2025-26` → `2026-27`, `2025-2026` → `2026-2027`; anything else → null (the user types it). */
export function nextAcademicYear(year: string): string | null {
  const m = /^\s*(\d{4})\s*[-–/]\s*(\d{2}|\d{4})\s*$/.exec(year);
  if (!m) return null;
  const from = Number(m[1]);
  const to = m[2] ?? "";
  const toFull = to.length === 2 ? Math.floor(from / 100) * 100 + Number(to) : Number(to);
  // 1999-00 crosses a century; anything that is not "the next year" is not understood.
  const expected = from + 1;
  if (toFull !== expected && !(to.length === 2 && Number(to) === expected % 100)) return null;
  const sep = year.includes("–") ? "–" : year.includes("/") ? "/" : "-";
  const next = from + 1;
  return to.length === 2
    ? `${next}${sep}${String((next + 1) % 100).padStart(2, "0")}`
    : `${next}${sep}${next + 1}`;
}
