// Renders assets/draftex-icon.svg into assets/draftex.ico (16, 32, 48 and
// 256 px PNG entries) for the Windows desktop shortcut. Run again after
// changing the SVG: node scripts/make-icon.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = fs.readFileSync(path.join(root, "assets", "draftex-icon.svg"));
const sizes = [16, 32, 48, 256];
const pngs = sizes.map((size) =>
  new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: true, defaultFontFamily: "Times New Roman" },
  })
    .render()
    .asPng(),
);

// ICO: 6-byte header, one 16-byte entry per image, then the PNG data.
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(size === 256 ? 0 : size, e);
  header.writeUInt8(size === 256 ? 0 : size, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i]!.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i]!.length;
});
fs.writeFileSync(path.join(root, "assets", "draftex.ico"), Buffer.concat([header, ...pngs]));
console.log(`assets/draftex.ico: ${sizes.join(", ")} px`);
