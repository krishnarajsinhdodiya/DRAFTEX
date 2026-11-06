import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import {
  MAX_SIDE_PX,
  MAX_UPLOAD_BYTES,
  UploadError,
  processUpload,
  sniff,
  svgNeedsFonts,
} from "@/server/uploads/process";
import { assetFile, storeUpload } from "@/server/uploads/store";
import { jpegWithMetadata, pdfWithPages, pngClaiming, solid, svg } from "../../support/images";

const box = fs.readFileSync("tests/fixtures/latex/assets/box.pdf");

async function rejects(input: Buffer, message: RegExp) {
  const e = await processUpload(input).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(UploadError);
  expect((e as Error).message).toMatch(message);
}

describe("sniff", () => {
  it("reads the type from the bytes, not the name", async () => {
    expect(sniff(await solid(2, 2, "png").toBuffer())).toBe("png");
    expect(sniff(await solid(2, 2, "jpeg").toBuffer())).toBe("jpg");
    expect(sniff(box)).toBe("pdf");
    expect(sniff(svg("<rect/>"))).toBe("svg");
    expect(sniff(Buffer.from('﻿<!DOCTYPE svg PUBLIC "x" "y"><svg></svg>'))).toBe("svg");
    expect(sniff(Buffer.from("GIF89a...."))).toBeNull();
    expect(sniff(Buffer.from("<html><svg></svg></html>"))).toBeNull();
  });
});

describe("processUpload: pictures", () => {
  it("drops EXIF and ICC, applies the orientation and keeps the format", async () => {
    const out = await processUpload(await jpegWithMetadata(40, 20));
    expect(out).toMatchObject({
      ext: "jpg",
      mime: "image/jpeg",
      from: "jpg",
      width: 20,
      height: 40,
    });
    const meta = await sharp(out.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("re-encodes PNG and shrinks pictures past the longest side", async () => {
    const out = await processUpload(await solid(MAX_SIDE_PX + 500, 100, "png").toBuffer());
    expect(out).toMatchObject({ ext: "png", mime: "image/png", width: MAX_SIDE_PX });
    expect(out.height).toBeLessThan(100);
  });

  it("is deterministic, so the same upload lands on the same hash", async () => {
    const input = await solid(30, 30, "png").toBuffer();
    expect((await processUpload(input)).sha256).toBe((await processUpload(input)).sha256);
  });

  it("refuses empty, oversized, unknown, damaged and bomb files with plain messages", async () => {
    await rejects(Buffer.alloc(0), /empty/);
    await rejects(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x89), /larger than 10 MB/);
    await rejects(Buffer.from("GIF89a...."), /PNG, JPG, PDF or SVG/);
    await rejects(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(40),
      ]),
      /could not be read/,
    );
    await rejects(pngClaiming(20_000, 20_000), /too large/);
  });
});

describe("processUpload: SVG", () => {
  it("renders the drawing to PNG at 300 DPI", async () => {
    const out = await processUpload(svg('<rect width="96" height="48" fill="#000"/>'));
    expect(out).toMatchObject({ ext: "png", from: "svg", width: 300, height: 150 });
  });

  it("loads the system fonts only for drawings with text", async () => {
    expect(svgNeedsFonts('<svg><rect width="1" height="1"/></svg>')).toBe(false);
    expect(svgNeedsFonts("<svg><!-- context --><textPath/></svg>")).toBe(false);
    expect(svgNeedsFonts('<svg><text x="1">CH3</text></svg>')).toBe(true);
    expect(svgNeedsFonts("<svg:svg><svg:text>OH</svg:text></svg:svg>")).toBe(true);
    const out = await processUpload(svg('<text x="4" y="30" font-size="24">CH3</text>'));
    expect(out).toMatchObject({ ext: "png", from: "svg" });
  });

  it("renders a huge drawing smaller instead of refusing it", async () => {
    const out = await processUpload(
      svg('<rect width="20000" height="20000"/>', 'width="20000" height="20000"'),
    );
    expect(out.width).toBeLessThanOrEqual(MAX_SIDE_PX);
  });

  it("accepts embedded images and in-file links, refuses outside links and entities", async () => {
    const dot = (await solid(1, 1, "png").toBuffer()).toString("base64");
    await expect(
      processUpload(
        svg(
          `<defs><rect id="r" width="5" height="5"/></defs><use href="#r"/><image width="5" height="5" xlink:href="data:image/png;base64,${dot}"/>`,
        ),
      ),
    ).resolves.toMatchObject({ ext: "png" });
    await rejects(svg('<image href="file:///etc/hosts"/>'), /links to other files/);
    await rejects(svg("<image xlink:href='logo.png'/>"), /links to other files/);
    await rejects(
      Buffer.from('<!DOCTYPE svg [<!ENTITY a "b">]><svg xmlns="http://www.w3.org/2000/svg"/>'),
      /entities/,
    );
  });

  it("refuses an empty or broken drawing", async () => {
    await rejects(svg("", 'width="0" height="0"'), /empty|could not be read/);
    await rejects(
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><rect"),
      /could not be read/,
    );
  });
});

describe("processUpload: PDF", () => {
  it("keeps a one-page PDF as it is, sized in points", async () => {
    const out = await processUpload(box);
    expect(out).toMatchObject({ ext: "pdf", mime: "application/pdf", from: "pdf" });
    expect(out.bytes.equals(box)).toBe(true);
    const made = await processUpload(pdfWithPages(1, 300, 150));
    expect([made.width, made.height]).toEqual([300, 150]);
  });

  it("refuses several pages, pages larger than A3 and damaged files", async () => {
    await rejects(pdfWithPages(2), /has 2 pages/);
    await rejects(pdfWithPages(1, 1191, 1684), /larger than A3/);
    await rejects(Buffer.from("%PDF-1.4\nnot really"), /could not be read/);
  });
});

describe("storeUpload", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dx-assets-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("writes the file once by hash and records a row for the uploader", async () => {
    const rows: unknown[] = [];
    const deps = {
      assetsDir: path.join(dir, "assets"),
      data: { assets: { add: async (_a: unknown, row: unknown) => void rows.push(row) } },
      checkPdf: async () => false,
    } as unknown as Parameters<typeof storeUpload>[0];
    const actor = { userId: "u1", role: "FACULTY" as const };
    const input = await solid(10, 10, "png").toBuffer();
    const a = await storeUpload(deps, actor, input, "  Structure.png ");
    const file = assetFile(deps.assetsDir, a.sha256, "png");
    const first = fs.statSync(file).mtimeMs;
    const b = await storeUpload(deps, actor, input, "");
    expect(b.sha256).toBe(a.sha256);
    expect(fs.statSync(file).mtimeMs).toBe(first);
    expect(fs.readdirSync(deps.assetsDir)).toEqual([`${a.sha256}.png`]);
    expect(rows).toEqual([
      expect.objectContaining({
        sha256: a.sha256,
        mime: "image/png",
        originalName: "Structure.png",
      }),
      expect.objectContaining({ originalName: "image" }),
    ]);
    const refused = await storeUpload(deps, actor, pdfWithPages(1), "x.pdf").catch(
      (e: unknown) => e,
    );
    expect(refused).toBeInstanceOf(UploadError);
    expect((refused as Error).message).toMatch(/cannot be placed on a paper/);
    expect(rows).toHaveLength(2);
  });
});
