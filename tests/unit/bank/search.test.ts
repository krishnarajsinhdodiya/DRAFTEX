// Search terms and page cursors (Phase 16; D127, D130). Invented text only.
import { describe, expect, it } from "vitest";
import { searchTerms } from "@/lib/bank/search";
import { decodeCursor, encodeCursor } from "@/lib/paging";

describe("searchTerms", () => {
  it("is null for an empty or blank search", () => {
    expect(searchTerms(undefined)).toBeNull();
    expect(searchTerms("   \t\n ")).toBeNull();
  });

  it("quotes every word so nothing is FTS5 syntax", () => {
    expect(searchTerms('NEAR(a b) OR "x" title:y -z *')).toEqual({
      match: '"NEAR(a" """x""" "title:y"',
      short: ["b)", "or", "-z", "*"],
      words: ["NEAR(a", "b)", "OR", '"x"', "title:y", "-z", "*"],
    });
    expect(searchTerms("isobutyl* AND")?.match).toBe('"isobutyl*" "AND"');
    expect(searchTerms('""""')?.match).toBe('""""""""""');
  });

  it("sends words under three characters to instr(), lower-cased", () => {
    expect(searchTerms("pH of 5% NaCl")).toEqual({
      match: '"NaCl"',
      short: ["ph", "of", "5%"],
      words: ["pH", "of", "5%", "NaCl"],
    });
    expect(searchTerms("_ %")).toEqual({ match: null, short: ["_", "%"], words: ["_", "%"] });
  });

  it("counts emoji and non-Latin letters as one character each", () => {
    expect(searchTerms("😀😀")?.short).toEqual(["😀😀"]);
    expect(searchTerms("😀😀😀")?.match).toBe('"😀😀😀"');
    expect(searchTerms("ΔG औषध")?.match).toBe('"औषध"');
  });

  it("keeps 100 characters and 8 different words", () => {
    expect(searchTerms("a".repeat(150))?.match).toBe(`"${"a".repeat(100)}"`);
    const r = searchTerms("one two three four five six seven eight nine ten two");
    expect(r?.words).toEqual(["one", "two", "three", "four", "five", "six", "seven", "eight"]);
  });

  it("folds compatibility forms (NFKC)", () => {
    expect(searchTerms("ﬁrst")?.match).toBe('"first"');
  });
});

describe("cursors", () => {
  const c = {
    t: Date.UTC(2026, 10, 16, 8, 42, 9, 249),
    id: "0b6d2f6e-6a5e-4b0e-9a4b-1d1b5f1e2c3a",
  };

  it("round-trip", () => {
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("read anything else as no cursor", () => {
    const bad = [
      null,
      "",
      "!!!",
      "x".repeat(201),
      Buffer.from("not json").toString("base64url"),
      Buffer.from(JSON.stringify({ t: "2026-11-16T08:42:09.249Z", id: "x" })).toString("base64url"),
      Buffer.from(JSON.stringify({ t: 1.5, id: "a" })).toString("base64url"),
      Buffer.from(JSON.stringify([c.t, c.id])).toString("base64url"),
    ];
    for (const b of bad) expect(decodeCursor(b)).toBeNull();
  });
});
