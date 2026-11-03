// Stand-in for the Tectonic binary in unit tests. Behaviour is chosen by
// markers in the input file so the compile service can be tested without TeX.
import fs from "node:fs";

const args = process.argv.slice(2);
const input = args[args.length - 1];
const tex = fs.readFileSync(input, "utf8");
const onlyCached = args.includes("--only-cached");
process.stdout.write(
  JSON.stringify({
    args,
    cache: process.env.TECTONIC_CACHE_DIR,
    secret: process.env.DX_SECRET ?? null,
  }),
);

if (tex.includes("SLEEP")) {
  await new Promise((r) => setTimeout(r, 10_000));
}
if (tex.includes("MISS") && onlyCached) {
  process.stderr.write("error: x.sty:1: ! LaTeX Error: File `x.sty' not found.\n");
  fs.writeFileSync("paper.log", "! LaTeX Error: File `x.sty' not found.\n");
  process.exit(1);
}
if (tex.includes("FAIL")) {
  process.stderr.write("error: paper.tex:3: Undefined control sequence\n");
  fs.writeFileSync("paper.log", "! Undefined control sequence.\nl.3 \\foo\n");
  process.exit(1);
}
if (tex.includes("NOPDF")) process.exit(0);
const warn = tex.includes("WARN")
  ? "warning: paper.tex:2: Overfull \\hbox (3.5pt too wide) in paragraph at lines 2--2\n"
  : "";
process.stderr.write(warn + "note: Writing `paper.pdf`\n");
const assets = fs.existsSync("assets") ? fs.readdirSync("assets") : [];
fs.writeFileSync("paper.log", `This is a log. assets=${assets.join(",")}\n`);
fs.writeFileSync("paper.pdf", tex.includes("BIG") ? Buffer.alloc(4096, 1) : "%PDF-1.5 fake");
