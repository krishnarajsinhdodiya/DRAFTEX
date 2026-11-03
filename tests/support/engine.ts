// Real Tectonic for golden, visual and fuzz tests: the copy installed by
// `npm run setup:tectonic` in the data folder.
import fs from "node:fs";
import { CompileService } from "@/lib/latex/compile";
import { tectonicEngine } from "@/lib/latex/engine";
import { binaryPath } from "@/lib/latex/tectonic";
import { dataPaths, getDataDir } from "@/lib/paths";

export function realCompileService(opts: { timeoutMs?: number } = {}): CompileService {
  const paths = dataPaths(getDataDir());
  const binary = binaryPath(paths.tectonicDir);
  if (!fs.existsSync(binary)) {
    throw new Error(`Tectonic is not installed at ${binary}. Run: npm run setup:tectonic`);
  }
  return new CompileService({
    engine: tectonicEngine({ binary, cacheDir: paths.tectonicCache }),
    // Goldens must pass offline: a cache miss is a failure, not a download.
    allowNetwork: false,
    timeoutMs: opts.timeoutMs ?? 60_000,
    concurrency: 2,
    rateLimit: { jobs: 100_000, perMs: 1 },
  });
}
