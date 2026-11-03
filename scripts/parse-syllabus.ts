// Reads the PCI 2026 B.Pharm syllabus PDF and writes the course catalogue seed
// (src/lib/catalogue/bpharm-2026.json) and an independent transcription of
// Tables X-a…X-h (src/lib/catalogue/table-x.json). Both files are committed;
// the app never reads the PDF. Run by hand when the syllabus changes:
//   node scripts/parse-syllabus.ts [--check]
// --check parses and compares with the committed files without writing.
// Problems the PDF itself has are recorded in the seed's "discrepancies" list;
// problems the parser cannot resolve stop it with the page number.
import fs from "node:fs";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PDF = path.join(ROOT, "docs/reference/pci/bpharm-syllabus-2026-nep2020.pdf");
const OUT_DIR = path.join(ROOT, "src/lib/catalogue");

type Item = { page: number; x: number; y: number; w: number; s: string; bold: boolean };

const CODE = /^BP\d{3}(?:T|P|I|RP)$/;
const OPTION = /^(?:AEC|SEC|VAC)\d$/;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** Horizontal table rules per page (y values, top first): tables are drawn as thin filled rectangles. */
const H_RULES = new Map<number, number[]>();

async function readItems(): Promise<Item[][]> {
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(PDF)), verbosity: 0 })
    .promise;
  const pages: Item[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // pdf.js marks bold faces on the loaded font object (available after rendering ops are read).
    const bold = new Set<string>();
    const ops = await page.getOperatorList();
    const rules = new Set<number>();
    ops.fnArray.forEach((fn, k) => {
      const box = fn === OPS.constructPath ? (ops.argsArray[k] as unknown[])[2] : undefined;
      if (!box) return;
      const [x0, y0, x1, y1] = Array.from(box as ArrayLike<number>) as [
        number,
        number,
        number,
        number,
      ];
      if (y1 - y0 < 2 && x1 - x0 > 100) rules.add(Math.round(y0));
    });
    H_RULES.set(
      p,
      [...rules].sort((a, b) => b - a),
    );
    for (const name of Object.keys(tc.styles)) {
      const font = page.commonObjs.has(name)
        ? (page.commonObjs.get(name) as { bold?: boolean })
        : undefined;
      if (font?.bold) bold.add(name);
    }
    const items: Item[] = [];
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const s = it.str.replace(/\s+/g, " ").trim();
      if (!s) continue;
      items.push({
        page: p,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        s,
        bold: bold.has(it.fontName),
      });
    }
    pages.push(items);
  }
  return pages;
}

/** Items sorted top-to-bottom, then left-to-right, joined into lines (same y within tol). */
function lines(items: Item[], tol = 3): Item[][] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const out: Item[][] = [];
  for (const it of sorted) {
    const last = out.at(-1);
    if (last && last[0]!.page === it.page && Math.abs(last[0]!.y - it.y) <= tol) last.push(it);
    else out.push([it]);
  }
  return out.map((l) => l.sort((a, b) => a.x - b.x));
}
const text = (l: Item[]) =>
  l
    .map((i) => i.s)
    .join(" ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(");
/** Several lines of a cell as one string. */
const para = (items: Item[], tol = 3) =>
  lines(items, tol).map(text).join(" ").replace(/\s+/g, " ").trim();

/** Splits items into table-cell pieces (between horizontal rules), in reading order. */
function pieces(items: Item[]): Item[][] {
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const rules = H_RULES.get(it.page) ?? [];
    const above = rules.filter((y) => y > it.y).at(-1) ?? 9999;
    const key = `${String(it.page).padStart(4, "0")}:${String(9999 - above).padStart(4, "0")}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
  }
  return [...groups.keys()].sort().map((k) => groups.get(k)!);
}

const fail = (page: number, msg: string): never => {
  throw new Error(`p.${page}: ${msg}`);
};

const num = (s: string) => (s === "--" || s === "-" || s === "–" ? 0 : Number(s));

// ---------------------------------------------------------------- Table X

type TableXRow = {
  code: string;
  semester: number;
  /** Elective slot label, e.g. "AEC – Elective 3", when the row is a slot. */
  electiveLabel: string | null;
  credits: number;
  continuousMarks: number | null;
  sessionalMarks: number | null;
  sessionalMinutes: number | null;
  internalMarks: number | null;
  endSemMarks: number;
  endSemMinutes: number;
  totalMarks: number;
  page: number;
};

const hours = (s: string) => Math.round(Number(s.replace(/\s*Hr$/i, "")) * 60);

function parseTableX(pages: Item[][]): TableXRow[] {
  const rows: TableXRow[] = [];
  let semester = 0;
  for (let p = 1; p <= pages.length; p++) {
    const items = pages[p - 1]!;
    const heading = items.find((i) => /^Table-X([a-h]): Semester/.test(i.s));
    if (heading) semester = "abcdefgh".indexOf(/^Table-X([a-h])/.exec(heading.s)![1]!) + 1;
    else if (semester && !items.some((i) => CODE.test(i.s) && i.x < 200)) continue;
    if (!semester) continue;
    if (items.some((i) => /^11\.2\./.test(i.s))) break; // end of Table X
    const ls = lines(items);
    for (let k = 0; k < ls.length; k++) {
      const l = ls[k]!;
      const code = l.find((i) => CODE.test(i.s));
      if (!code) continue;
      const vals = l
        .filter((i) => i.x > code.x + 30 && /^(?:\d+(?:\.\d+)?(?: ?Hr)?|–)$/.test(i.s))
        .map((i) => i.s.replace(/(\d)Hr$/, "$1 Hr"));
      if (vals.length < 5) continue;
      const near = ls
        .slice(Math.max(0, k - 1), k + 1)
        .map(text)
        .join(" ");
      const label = /((?:AEC|SEC|VAC) – Elective \d)/.exec(near)?.[1] ?? null;
      const dash = (v: string | undefined) => (v === undefined || v === "–" ? null : v);
      let r: TableXRow;
      if (vals.length === 8) {
        const [cr, cont, sess, sdur, internal, end, edur, total] = vals as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        r = {
          code: code.s,
          semester,
          electiveLabel: label,
          credits: Number(cr),
          continuousMarks: Number(cont),
          sessionalMarks: Number(sess),
          sessionalMinutes: hours(sdur),
          internalMarks: Number(internal),
          endSemMarks: Number(end),
          endSemMinutes: hours(edur),
          totalMarks: Number(total),
          page: p,
        };
      } else {
        // Internship / research project: credit – – – external duration total
        const [cr, a, b, c, end, edur, total] = vals;
        if ([a, b, c].some((v) => dash(v) !== null))
          fail(p, `unexpected Table X row for ${code.s}`);
        r = {
          code: code.s,
          semester,
          electiveLabel: label,
          credits: Number(cr),
          continuousMarks: null,
          sessionalMarks: null,
          sessionalMinutes: null,
          internalMarks: null,
          endSemMarks: Number(end),
          endSemMinutes: hours(edur!),
          totalMarks: Number(total),
          page: p,
        };
      }
      if (rows.some((x) => x.code === r.code)) fail(p, `${r.code} twice in Table X`);
      rows.push(r);
    }
  }
  return rows;
}

// ---------------------------------------------------------- Tables I-VIII

type StudyRow = {
  code: string;
  semester: number;
  hoursPerWeek: number;
  credits: number;
  page: number;
};

/** Plain rows only; elective slots are checked through their options. Numbers may sit on the line next to the code. */
function parseCourseOfStudy(pages: Item[][]): StudyRow[] {
  const rows: StudyRow[] = [];
  let semester = 0;
  const numbers = (l: Item[]) => l.filter((i) => /^(?:\d+|-)$/.test(i.s) && i.x > 300);
  for (let p = 1; p <= pages.length; p++) {
    const ls = lines(pages[p - 1]!);
    if (ls.some((l) => /^Table-IX/.test(text(l)))) break;
    for (let k = 0; k < ls.length; k++) {
      const l = ls[k]!;
      const h = /^Table-([IV]+): Course of study for semester/.exec(text(l));
      if (h) semester = ROMAN.indexOf(h[1]!) + 1;
      const code = l.find((i) => CODE.test(i.s));
      if (!semester || !code || l.some((i) => OPTION.test(i.s) || /\b(?:AEC|SEC|VAC)/.test(i.s)))
        continue;
      let nums = numbers(l);
      if (nums.length === 0) {
        const near = [ls[k - 1], ls[k + 1]].find(
          (n) => n && !n.some((i) => CODE.test(i.s)) && numbers(n).length === 2,
        );
        if (near) nums = numbers(near);
      }
      if (nums.length !== 2) continue;
      rows.push({
        code: code.s,
        semester,
        hoursPerWeek: num(nums[0]!.s),
        credits: Number(nums[1]!.s),
        page: p,
      });
    }
  }
  return rows;
}

// ------------------------------------------------------------ course pages

type ParsedCourse = {
  code: string;
  title: string;
  courseType: string;
  credits: number;
  lectureHrs: number;
  tutorialHrs: number;
  practicalHrs: number;
  maxHours: number | null;
  maxMarks: number;
  internalMarks: number;
  endSemMarks: number;
  outcomes: { number: number; text: string }[];
  units: { number: number; title: string; hours: number }[];
  page: number;
  notes: string[];
};

const LABELS = new Set(["Course Code", "Course", "Code", "Course Title", "Course Type", "Type"]);

/** Header block of a single-course page, or null for any other page. */
function parseHeader(items: Item[]) {
  const titleLabel = items.find((i) => i.s === "Course Title");
  const hoursLabel = items.find((i) => /^Hours Per Week/.test(i.s));
  const typeLabel = items.find((i) => i.s === "Course Type" || i.s === "Type");
  if (!titleLabel || !hoursLabel || !typeLabel) return null;
  const band = items.filter(
    (i) => i.y < titleLabel.y + 12 && i.y > hoursLabel.y + 6 && i.y < 790 && !LABELS.has(i.s),
  );
  const codes = band.filter(
    (i) => /^BP\d{3}(?:T|P|I|RP)(?: (?:AEC|SEC|VAC)\d)?$/.test(i.s) || CODE.test(i.s),
  );
  if (codes.length !== 1) return null; // overview pages list several options
  let code = codes[0]!.s;
  const opt = band.find((i) => OPTION.test(i.s));
  if (opt && !code.includes(" ")) code = `${code} ${opt.s}`;
  const type = band.find((i) => /^(?:Core|CORE|Elective|Internship)$/.test(i.s) && i.x > 380);
  const titleItems = band.filter(
    (i) =>
      i !== codes[0] &&
      i !== opt &&
      i !== type &&
      i.x > codes[0]!.x + 40 &&
      i.x < (type?.x ?? 430) - 10,
  );
  return { code, title: para(titleItems, 6), courseType: type?.s ?? "", hoursLabel, items };
}

function parseNumbers(items: Item[], hoursLabel: Item, page: number) {
  // Values sit in table cells whose labels are not aligned with them, so read them in column order.
  const L = items.find((i) => i.s === "L" && i.y < hoursLabel.y);
  const marksLabel = items.find((i) => /^Maximum( Marks)?$/.test(i.s) && i.y < hoursLabel.y);
  const objectives = items.find((i) => /^COURSE OBJECTIVES|^Course Objectives/i.test(i.s));
  if (!L || !marksLabel) return fail(page, "course header numbers not found");
  const value = /^(?:\d+(?:\.\d+)?|--|-|–)\*?$/;
  const row = items
    .filter((i) => i.y < L.y - 4 && i.y > marksLabel.y + 4 && value.test(i.s))
    .sort((a, b) => a.x - b.x);
  const floor = objectives ? objectives.y + 4 : marksLabel.y - 45;
  const mrow = items
    .filter((i) => i.y < marksLabel.y - 4 && i.y > floor && /^(?:\d+|--|–)$/.test(i.s))
    .sort((a, b) => a.x - b.x);
  if (row.length < 4 || row.length > 5) fail(page, `header row has ${row.length} values`);
  if (mrow.length !== 3) fail(page, `marks row has ${mrow.length} values`);
  const v = row.map((i) => num(i.s.replace("*", "")));
  return {
    credits: v[0]!,
    lectureHrs: v[1]!,
    tutorialHrs: v[2]!,
    practicalHrs: v[3]!,
    maxHours: row.length === 5 ? v[4]! : null,
    maxMarks: num(mrow[0]!.s),
    internalMarks: num(mrow[1]!.s),
    endSemMarks: num(mrow[2]!.s),
  };
}

/** A section heading is bold or starts at the left margin, left of any table cell text. */
const isHeading = (l: Item[], re: RegExp) => (l[0]!.bold || l[0]!.x < 100) && re.test(text(l));
const CO_HEAD = /^Course Outcomes?\b/i;
const AFTER_CO =
  /^(?:Detailed\b|Course Content|Syllabus|List of (?:Experiments|Practicals?)|Practicals?\b|Recommended|References?|Unit\b|Module)/i;

function parseOutcomes(ls: Item[][], page: number) {
  const start = ls.findIndex((l) => CO_HEAD.test(text(l)));
  if (start < 0) return fail(page, "no Course Outcomes heading");
  let end = ls.findIndex(
    (l, k) => k > start && (isHeading(l, AFTER_CO) || /^Unit No/i.test(text(l))),
  );
  if (end < 0) end = ls.length;
  const region = ls.slice(start + 1, end).flat();
  const isNumber = (i: Item) => /^(?:CO ?)?\d{1,2}\.?$/.test(i.s) && i.x < 112;
  const out: { number: number; text: string[] }[] = [];
  for (const piece of pieces(region)) {
    const n = piece.filter(isNumber);
    const body = piece.filter((i) => !isNumber(i));
    if (n.length > 1) fail(page, `two CO numbers in one cell (${n.map((i) => i.s).join(", ")})`);
    if (n.length === 1) out.push({ number: Number(n[0]!.s.replace(/\D/g, "")), text: [] });
    const cur = out.at(-1);
    if (cur) cur.text.push(...lines(body).map(text)); // a cell continued from the previous page
  }
  if (!out.length) return fail(page, "no CO numbers");
  if (out.some((o, k) => o.number !== k + 1))
    return fail(page, `CO numbers ${out.map((o) => o.number).join(",")}`);
  return out.map(({ number, text: t }) => {
    // A word broken at a line end keeps its hyphen and loses the line break ("water-" + "insoluble").
    const joined = t
      .reduce((acc, l) => (/\w-$/.test(acc) ? acc + l : `${acc} ${l}`), "")
      .replace(/\s+/g, " ")
      .trim();
    if (!joined) fail(page, `CO ${number} has no text`);
    return { number, text: joined };
  });
}

function parseUnits(ls: Item[][], page: number, notes: string[]) {
  const start = ls.findIndex(
    (l) =>
      /^Unit( No\.?)?\b/i.test(text(l)) &&
      (l.some((i) => /Topics|Content/i.test(i.s)) || /^Unit No/i.test(text(l))),
  );
  if (start < 0) return [];
  let end = ls.findIndex(
    (l, k) =>
      k > start &&
      /^(?:Recommended|References?\b|Text ?books?|Suggested (?:Readings|Books))/i.test(text(l)),
  );
  if (end < 0) end = ls.length;
  const region = ls.slice(start, end).flat();
  const isNumeral = (i: Item) => i.x < 110 && (ROMAN.includes(i.s) || /^\d{1,2}$/.test(i.s));
  const isHours = (i: Item) => i.x > 400 && /^\d+(?:\.\d+)?\s*(?:Hours?|Hrs?\.?)?$/i.test(i.s);
  const out: { number: number; title: string; hours: number }[] = [];
  for (const piece of pieces(region)) {
    const n = piece.filter(isNumeral);
    const h = piece.filter(isHours);
    if (n.length > 1 || h.length > 1)
      fail(page, `unit cell with ${n.length} numbers and ${h.length} hours`);
    if (!n.length) {
      if (h.length) fail(page, "hours without a unit number");
      continue; // header row, or a unit continued from the previous page
    }
    if (!h.length) fail(page, `unit ${n[0]!.s} has no hours`);
    // The title is the run of wholly bold lines at the top of the topics cell, when there is one.
    const topic = lines(piece.filter((i) => !isNumeral(i) && !isHours(i)));
    const right = Math.max(
      ...piece.filter((i) => !isNumeral(i) && !isHours(i)).map((i) => i.x + i.w),
    );
    const head: Item[][] = [];
    for (const l of topic) {
      if (!l.every((i) => i.bold || /^[:.,;)–-]$/.test(i.s)) || /^[•●▪]$/.test(l[0]!.s)) break;
      // A second bold line belongs to the title only when the first breaks mid-phrase; otherwise it is a sub-heading.
      const prev = head.at(-1);
      const wrapped = (l: Item[]) => Math.max(...l.map((i) => i.x + i.w)) >= right - 45;
      if (
        prev &&
        !wrapped(prev) &&
        !/(?:\b(?:and|of|in|for|the|to|with|&)|[,(–-])$/.test(text(prev)) &&
        !/^[a-z(]/.test(text(l))
      )
        break;
      head.push(l);
    }
    out.push({
      number: ROMAN.includes(n[0]!.s) ? ROMAN.indexOf(n[0]!.s) + 1 : Number(n[0]!.s),
      title: head
        .map(text)
        .join(" ")
        .replace(/\s+/g, " ")
        .replace(/^Unit [IVX]+\s*[:.–-]\s*/i, "")
        .replace(/^[:.–-]\s*/, "")
        .replace(/\s*–\s*-\s*/g, " – ")
        .replace(/\s*[:.–-]\s*$/, "")
        .trim(),
      hours: Number(/^[\d.]+/.exec(h[0]!.s)![0]),
    });
  }
  if (out.some((u, k) => u.number !== k + 1)) {
    // The PDF prints a wrong numeral now and then (e.g. VII twice); units are numbered by position.
    notes.push(
      `unit numbers printed as ${out.map((u) => ROMAN[u.number - 1] ?? u.number).join(", ")}; numbered 1-${out.length} by position`,
    );
    out.forEach((u, k) => (u.number = k + 1));
  }
  return out;
}

function parseCourses(pages: Item[][]): ParsedCourse[] {
  const starts: { page: number; head: NonNullable<ReturnType<typeof parseHeader>> }[] = [];
  for (let p = 1; p <= pages.length; p++) {
    const head = parseHeader(pages[p - 1]!);
    if (head) starts.push({ page: p, head });
  }
  return starts.flatMap(({ page, head }, k) => {
    try {
      return [parseOne(page, head, k)];
    } catch (e) {
      problems.push((e as Error).message + ` (${head.code})`);
      return [];
    }
  });
  function parseOne(
    page: number,
    head: NonNullable<ReturnType<typeof parseHeader>>,
    k: number,
  ): ParsedCourse {
    const last = (starts[k + 1]?.page ?? pages.length + 1) - 1;
    const body = pages
      .slice(page - 1, last)
      .flat()
      .filter((i) => i.y > 60 && i.y < 795); // drop running head and page number
    const notes: string[] = [];
    const ls = lines(body.filter((i) => i.page > page || i.y < head.hoursLabel.y - 60));
    const numbers = parseNumbers(head.items, head.hoursLabel, page);
    const internship = /I$|RP$/.test(head.code);
    return {
      code: head.code,
      title: head.title,
      courseType: head.courseType,
      ...numbers,
      outcomes: internship ? [] : parseOutcomes(ls, page),
      units: internship ? [] : parseUnits(ls, page, notes),
      page,
      notes,
    };
  }
}

const problems: string[] = [];

// ------------------------------------------------------------------- merge

/**
 * Titles printed oddly on the course page, replaced by the wording of the
 * course-of-study tables. Each one is listed in the seed's discrepancies.
 */
const TITLE_FIXES: Record<string, { title: string; why: string }> = {
  BP510P: {
    title: "Systemic Pharmacology II (Practical)",
    why: "course page prints the title in capitals",
  },
  "BP708T AEC1": {
    title: "Current Good Manufacturing Practices (cGMP) (Theory)",
    why: 'course page prints only "cGMP (Theory)"; Table VII and Appendix I give the full name',
  },
};

/** Things the PDF states inconsistently that the parser cannot see on its own. Checked by hand. */
const KNOWN: { page: number; text: string }[] = [
  {
    page: 26,
    text: "Table IX gives credits per semester 21/26/25/23/22/26/26/24; the Curricular Structure page (p. 52) gives 21/23/23/25/25/26/26/24. Both total 193. Tables I-VIII and X agree with Table IX; the seed follows them.",
  },
  {
    page: 24,
    text: "Table VII lists BP708T AEC1-AEC6; the course pages also include BP708T AEC7 Precision Medicine (p. 322). AEC7 is seeded as an option of BP708T.",
  },
  {
    page: 41,
    text: "BP810RP (Research Project) has no course page of its own; it is seeded from Table X-h only.",
  },
  {
    page: 20,
    text: 'Table III calls BP302T "Environmental Sciences", Table X-c "Environmental Science". The seed uses the course page title.',
  },
];

type Discrepancy = { code?: string; page: number; text: string };

function merge(tableX: TableXRow[], study: StudyRow[], courses: ParsedCourse[]) {
  const discrepancies: Discrepancy[] = KNOWN.map((k) => ({ ...k }));
  const out = [];
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const used = new Set<string>();
  for (const row of tableX) {
    const options = row.electiveLabel
      ? courses.filter((c) => c.code.startsWith(`${row.code} `))
      : [byCode.get(row.code)];
    if (row.electiveLabel && !options.length)
      fail(row.page, `no options for elective slot ${row.code}`);
    for (const c of options) {
      if (!c && !/RP$/.test(row.code)) fail(row.page, `no course page for ${row.code}`);
      if (c) used.add(c.code);
      const code = c?.code ?? row.code;
      const kind = /RP$/.test(row.code)
        ? "PROJECT"
        : /T$/.test(row.code)
          ? "THEORY"
          : /P$/.test(row.code)
            ? "PRACTICAL"
            : "INTERNSHIP";
      const note = (text: string) => discrepancies.push({ code, page: c?.page ?? row.page, text });
      if (c) {
        if (c.credits !== row.credits)
          note(`credits ${c.credits} on the course page, ${row.credits} in Table X`);
        if (c.maxMarks !== row.totalMarks)
          note(`maximum marks ${c.maxMarks} on the course page, ${row.totalMarks} in Table X`);
        if (c.endSemMarks !== row.endSemMarks)
          note(`ESE ${c.endSemMarks} on the course page, ${row.endSemMarks} in Table X`);
        if (row.internalMarks !== null && c.internalMarks !== row.internalMarks)
          note(`SE ${c.internalMarks} on the course page, ${row.internalMarks} in Table X`);
        const unitHours = c.units.reduce((s, u) => s + u.hours, 0);
        if (c.units.length && c.maxHours !== null && unitHours !== c.maxHours)
          note(`unit hours add up to ${unitHours}; the course page gives ${c.maxHours} hours`);
        for (const n of c.notes) note(n);
        c.outcomes.forEach((o, k) => {
          const first = c.outcomes.findIndex((x) => x.text === o.text);
          if (first < k) note(`CO ${o.number} repeats CO ${first + 1} word for word`);
        });
      }
      const plan = study.find((s) => s.code === row.code);
      if (plan) {
        if (plan.credits !== row.credits)
          discrepancies.push({
            code,
            page: plan.page,
            text: `credits ${plan.credits} in Table ${ROMAN[plan.semester - 1]}, ${row.credits} in Table X`,
          });
        if (plan.semester !== row.semester)
          fail(plan.page, `${row.code}: semester differs between tables`);
        if (
          c &&
          kind !== "INTERNSHIP" &&
          plan.hoursPerWeek !== c.lectureHrs + c.tutorialHrs + c.practicalHrs
        ) {
          discrepancies.push({
            code,
            page: plan.page,
            text: `${plan.hoursPerWeek} hours a week in Table ${ROMAN[plan.semester - 1]}; the course page gives L-T-P ${c.lectureHrs}-${c.tutorialHrs}-${c.practicalHrs}`,
          });
        }
      }
      const fix = TITLE_FIXES[code];
      if (fix) note(`title: ${fix.why}`);
      out.push({
        code,
        title: fix?.title ?? c?.title ?? "Research Project",
        semester: row.semester,
        courseKind: kind,
        credits: row.credits,
        lectureHrs: c?.lectureHrs ?? 0,
        tutorialHrs: c?.tutorialHrs ?? 0,
        practicalHrs: c?.practicalHrs ?? 0,
        maxHours: c?.maxHours || null,
        maxMarks: row.totalMarks,
        continuousMarks: row.continuousMarks ?? 0,
        sessionalMarks: row.sessionalMarks ?? 0,
        sessionalMinutes: row.sessionalMinutes,
        endSemMarks: row.endSemMarks,
        endSemMinutes: row.endSemMinutes,
        ruleSetId: kind === "THEORY" || kind === "PRACTICAL" ? "PCI_2026_BPHARM" : null,
        electiveOf: row.electiveLabel ? row.code : null,
        electiveLabel: row.electiveLabel,
        syllabusPage: c?.page ?? null,
        outcomes: c?.outcomes ?? [],
        units: c?.units ?? [],
      });
    }
  }
  const orphans = courses.filter((c) => !used.has(c.code));
  if (orphans.length)
    fail(orphans[0]!.page, `course pages not in Table X: ${orphans.map((c) => c.code).join(", ")}`);
  const unplanned = tableX.filter((r) => !r.electiveLabel && !study.some((s) => s.code === r.code));
  for (const r of unplanned)
    discrepancies.push({
      code: r.code,
      page: r.page,
      text: "not found as a plain row in Tables I-VIII (checked through Table X only)",
    });
  return { courses: out, discrepancies };
}

// ------------------------------------------------------------------- main

const pages = await readItems();
const tableX = parseTableX(pages);
const study = parseCourseOfStudy(pages);
const courses = parseCourses(pages);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
const merged = merge(tableX, study, courses);

const source = {
  document: path.relative(ROOT, PDF).split(path.sep).join("/"),
  sha256: (await import("node:crypto"))
    .createHash("sha256")
    .update(fs.readFileSync(PDF))
    .digest("hex"),
  pages: "PDF page numbers (printed page + 15 in the regulations part)",
};
const files = {
  "bpharm-2026.json": {
    $comment:
      "Generated by scripts/parse-syllabus.ts from the PCI 2026 B.Pharm syllabus. Do not edit by hand; fix the parser and run it again.",
    program: "B_PHARM",
    source,
    discrepancies: merged.discrepancies,
    courses: merged.courses,
  },
  "table-x.json": {
    $comment:
      "Tables X-a to X-h of the PCI 2026 B.Pharm syllabus, transcribed by scripts/parse-syllabus.ts. Used only to verify the catalogue seed.",
    source,
    rows: tableX,
  },
};

if (process.argv.includes("--debug")) {
  console.log(JSON.stringify({ tableX, study, courses }, null, 1));
} else {
  let stale = false;
  for (const [name, data] of Object.entries(files)) {
    const file = path.join(OUT_DIR, name);
    const json = `${JSON.stringify(data, null, 2)}\n`;
    if (process.argv.includes("--check")) {
      if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== json) {
        console.error(`${name} is out of date; run node scripts/parse-syllabus.ts`);
        stale = true;
      }
    } else {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(file, json);
    }
  }
  console.log(
    `Courses: ${merged.courses.length} · Table X rows: ${tableX.length} · discrepancies: ${merged.discrepancies.length}`,
  );
  if (stale) process.exit(1);
}
