import { describe, expect, it } from "vitest";
import { questionNumbers } from "@/lib/paper/numbering";

const g = (key: string, slots: number, numbering?: "GROUP" | "QUESTION") => ({
  key,
  slots,
  ...(numbering ? { numbering } : {}),
});

describe("questionNumbers", () => {
  it("numbers groups straight through the parts by default", () => {
    const n = questionNumbers({
      numbering: { prefix: "Q:", separator: "" },
      parts: [{ groups: [g("a", 2), g("b", 1)] }, { groups: [g("c", 3, "GROUP")] }],
    });
    expect(n.map((x) => x.label)).toEqual(["Q:1", "Q:2", "Q:3"]);
    expect(n[0]).toMatchObject({
      numbering: "GROUP",
      slotLabels: ["Q:1(1)", "Q:1(2)"],
      printed: ["1.", "2."],
    });
  });

  it("gives every question its own number, continuing across groups and parts", () => {
    const n = questionNumbers({
      numbering: { prefix: "Q.", separator: ")" },
      parts: [
        { groups: [g("s1c", 1, "QUESTION"), g("s1l", 4, "QUESTION")] },
        { groups: [g("mid", 2), g("s2l", 2, "QUESTION")] },
      ],
    });
    expect(n.map((x) => x.printed)).toEqual([
      ["Q.1)"],
      ["Q.2)", "Q.3)", "Q.4)", "Q.5)"],
      ["1.", "2."],
      ["Q.7)", "Q.8)"],
    ]);
    expect(n[2]?.label).toBe("Q.6)");
    expect(n[3]?.label).toBeUndefined();
    expect(n[3]?.slotLabels).toEqual(["Q.7)", "Q.8)"]);
  });
});
