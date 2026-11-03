// Generated upload fixtures: no real paper images in the repo.
import zlib from "node:zlib";
import sharp from "sharp";

export function solid(width: number, height: number, format: "png" | "jpeg") {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })[format]();
}

/** A JPEG carrying everything the paper must not: EXIF with a resolution, an ICC profile, orientation 6. */
export async function jpegWithMetadata(width = 40, height = 20): Promise<Buffer> {
  return solid(width, height, "jpeg")
    .withIccProfile("p3")
    .withExif({ IFD0: { Copyright: "fixture", XResolution: "300/1", YResolution: "300/1" } })
    .withMetadata({ orientation: 6, density: 300 })
    .toBuffer();
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A tiny PNG whose header claims a huge picture (a decompression bomb). */
export function pngClaiming(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 0, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.alloc(16))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A valid PDF with `pages` pages, each a drawn rectangle, of the given size in points. */
export function pdfWithPages(pages: number, w = 200, h = 100): Buffer {
  const objs: string[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i} 0 R`).join(" ");
  const draw = `0 0 0 RG 2 w 10 10 ${w - 20} ${h - 20} re S`;
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  objs.push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  for (let i = 0; i < pages; i++) {
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << >> /Contents 3 0 R >>`,
    );
  }
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export const svg = (body: string, attrs = 'width="96" height="48"') =>
  Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<!-- exported -->\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`,
  );
