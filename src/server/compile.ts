// The app's one compile service (SPEC §9). Phase 5 compiles through it.
import { CompileService } from "@/lib/latex/compile";
import { tectonicEngine } from "@/lib/latex/engine";
import { binaryPath } from "@/lib/latex/tectonic";
import { dataPaths, getDataDir } from "@/lib/paths";

const globalForCompile = globalThis as unknown as { draftexCompile?: CompileService };

export function getCompileService(): CompileService {
  if (!globalForCompile.draftexCompile) {
    const paths = dataPaths(getDataDir());
    globalForCompile.draftexCompile = new CompileService({
      engine: tectonicEngine({
        binary: binaryPath(paths.tectonicDir),
        cacheDir: paths.tectonicCache,
      }),
    });
  }
  return globalForCompile.draftexCompile;
}
