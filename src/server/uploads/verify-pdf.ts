// pdf.js reads PDFs that xdvipdfmx cannot embed (a page without a content
// stream fails with "Invalid object type"). A PDF is accepted only after the
// real engine has placed it on a page once.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CompileService } from "@/lib/latex/compile";
import { goldenFailures } from "@/lib/latex/log";

export function pdfCheckTex(name: string): string {
  return [
    "\\documentclass{article}",
    "\\usepackage{graphicx}",
    "\\pagestyle{empty}",
    "\\begin{document}",
    `\\noindent\\includegraphics[width=2in]{${name}}`,
    "\\end{document}",
    "",
  ].join("\n");
}

/** True when the engine embeds the PDF without errors or warnings. */
export async function engineAcceptsPdf(
  compile: Pick<CompileService, "compile">,
  userId: string,
  sha256: string,
  bytes: Buffer,
): Promise<boolean> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dx-pdf-check-"));
  try {
    const name = `assets/${sha256}.pdf`;
    const file = path.join(dir, `${sha256}.pdf`);
    await fs.writeFile(file, bytes);
    const res = await compile.compile({
      userId,
      tex: pdfCheckTex(name),
      assets: [{ name, sourcePath: file }],
    });
    return Boolean(res.ok && res.pdf) && goldenFailures(res.diagnostics).length === 0;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
