import { describe, expect, it } from "vitest";
import raw from "../../../docs/pci-rules.json" with { type: "json" };
import { parseRuleSet, pciRuleSet, ruleSetById, RuleSetError } from "@/lib/rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests mutate the raw JSON freely to break it
type RawFile = Record<string, any>;
const clone = (): RawFile => structuredClone(raw) as RawFile;

describe("PCI 2026 rule set", () => {
  const rules = pciRuleSet();

  it("loads the real file", () => {
    expect(rules.ruleSetId).toBe("PCI_2026_BPHARM");
    expect(rules.program).toBe("B_PHARM");
    expect(pciRuleSet()).toBe(rules);
  });

  it("resolves 1 credit to the 2-credit pattern", () => {
    expect(rules.theory.SESSIONAL.get(1)).toEqual(rules.theory.SESSIONAL.get(2));
    expect(rules.theory.END_SEMESTER.get(1)).toEqual(rules.theory.END_SEMESTER.get(2));
  });

  it("matches Tables XIII and XV (p. 28-29)", () => {
    const end4 = rules.theory.END_SEMESTER.get(4);
    expect(end4?.durationMinutes).toBe(180);
    expect(end4?.groups.map((g) => [g.type, g.total, g.compulsory])).toEqual([
      ["OBJECTIVE", 20, true],
      ["SHORT", 20, false],
      ["LONG", 20, false],
    ]);
    expect(end4?.groups[0]?.variants).toHaveLength(2);
    expect(rules.theory.END_SEMESTER.get(3)?.groups[2]?.variants[0]?.marksEach).toBe(7.5);
    expect([...rules.theory.SESSIONAL.values()].map((p) => p.durationMinutes)).toEqual([
      60, 60, 60, 60,
    ]);
    expect([...rules.theory.SESSIONAL].map(([c, p]) => [c, p.maxMarks])).toEqual(
      expect.arrayContaining([
        [4, 20],
        [3, 15],
        [2, 10],
        [1, 10],
      ]),
    );
  });

  it("sessional paper = internal marks minus continuous mode (Table XI, p. 27)", () => {
    for (const [credit, p] of rules.theory.SESSIONAL) {
      expect(p.maxMarks).toBe((rules.creditMarks.get(credit)?.internal ?? 0) / 2);
    }
  });

  it("finds rule sets by id", () => {
    expect(ruleSetById("PCI_2026_BPHARM")).toBe(rules);
    expect(ruleSetById("PCI_2026_MPHARM")).toBeNull();
    expect(ruleSetById(null)).toBeNull();
    expect(ruleSetById(undefined)).toBeNull();
  });

  describe("rejects a broken file", () => {
    const cases: [string, (f: RawFile) => void, RegExp][] = [
      ["wrong shape", (f) => delete f.practical, /malformed/],
      [
        "unknown credit key",
        (f) => (f.theory.SESSIONAL["5"] = f.theory.SESSIONAL["4"]),
        /"5" is not a credit/,
      ],
      ["text where a pattern belongs", (f) => (f.theory.SESSIONAL["3"] = "see 4"), /found text/],
      [
        "$ref to a missing credit",
        (f) => {
          delete f.theory.END_SEMESTER["2"];
          f.theory.END_SEMESTER["3"] = { $ref: "2" };
        },
        /\$ref must point/,
      ],
      ["$ref chain", (f) => (f.theory.END_SEMESTER["3"] = { $ref: "1" }), /\$ref must point/],
      [
        "credit marks not adding up",
        (f) => (f.creditMarks["4"].internal = 41),
        /internal \+ external/,
      ],
      [
        "attempt over slots",
        (f) => (f.theory.SESSIONAL["4"].groups[1].attempt = 4),
        /attempt > slots/,
      ],
      [
        "compulsory with choice",
        (f) => (f.theory.SESSIONAL["4"].groups[0].variants[0].attempt = 3),
        /compulsory group/,
      ],
      [
        "shape not matching total",
        (f) => (f.theory.SESSIONAL["4"].groups[1].marksEach = 4),
        /does not add up/,
      ],
      [
        "groups not matching maxMarks",
        (f) => (f.theory.SESSIONAL["4"].maxMarks = 25),
        /groups ≠ maxMarks/,
      ],
      [
        "end-sem not matching external",
        (f) => {
          f.theory.END_SEMESTER["4"].maxMarks = 61;
          f.theory.END_SEMESTER["4"].groups[2].total = 21;
          f.theory.END_SEMESTER["4"].groups[2].variants = [{ slots: 3, attempt: 3, marksEach: 7 }];
          delete f.theory.END_SEMESTER["4"].groups[2].slots;
          f.theory.END_SEMESTER["4"].groups[2].compulsory = true;
        },
        /external marks for 4/,
      ],
      [
        "practical components",
        (f) => (f.practical.SESSIONAL.components[0].marks = 3),
        /components ≠ maxMarks/,
      ],
      [
        "practical vs external",
        (f) => (f.practical.allowedCredits = [1, 2, 4]),
        /end-semester marks ≠ external/,
      ],
      [
        "practical credit with no marks scheme",
        (f) => (f.practical.allowedCredits = [5]),
        /external marks for 5 credit/,
      ],
    ];
    for (const [name, mutate, message] of cases) {
      it(name, () => {
        const f = clone();
        mutate(f);
        expect(() => parseRuleSet(f)).toThrow(RuleSetError);
        expect(() => parseRuleSet(f)).toThrow(message);
      });
    }
  });
});
