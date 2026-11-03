import { describe, expect, it } from "vitest";
import { checkMath } from "@/lib/editor/math";

describe("checkMath", () => {
  it("maps MathLive's own commands to plain LaTeX", () => {
    expect(checkMath(" \\int_0^1 x\\,\\differentialD x ")).toEqual({
      ok: true,
      latex: "\\int_0^1 x\\,\\mathrm{d} x",
    });
    expect(checkMath("\\mleft(\\exponentialE^{\\imaginaryI\\pi}\\mright)")).toMatchObject({
      ok: true,
      latex: "\\left(\\mathrm{e}^{\\mathrm{i}\\pi}\\right)",
    });
    expect(checkMath("\\operatorname*{arg\\,max}")).toMatchObject({ ok: true });
  });

  it("refuses empty boxes, empty input and commands outside the allow-list", () => {
    expect(checkMath("\\frac{\\placeholder{}}{2}")).toEqual({
      ok: false,
      message: "Fill in or remove the empty boxes in the equation.",
    });
    expect(checkMath("  ")).toEqual({ ok: false, message: "The equation is empty." });
    const bad = checkMath("\\input{/etc/hosts}");
    expect(bad.ok).toBe(false);
  });
});
