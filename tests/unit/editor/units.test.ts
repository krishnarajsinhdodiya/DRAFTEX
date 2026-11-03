import { describe, expect, it } from "vitest";
import { COMMON_UNITS, unitLabel } from "@/components/editor/units";
import { sanitizeLatex } from "@/lib/latex/sanitize";

describe("common units", () => {
  it.each(COMMON_UNITS)("$label passes the maths allow-list", ({ unit }) => {
    expect(sanitizeLatex(unit, "math").ok).toBe(true);
  });
  it("labels known units and shows others as typed", () => {
    expect(unitLabel("\\celsius")).toBe("°C");
    expect(unitLabel("\\joule")).toBe("\\joule");
  });
});
