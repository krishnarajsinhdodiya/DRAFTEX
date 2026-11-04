// Installs the pinned LaTeX engine into <dataDir>/tools and warms its package
// cache so DRAFTEX compiles offline afterwards. Safe to run again.
// Usage: node scripts/setup-tectonic.ts [--skip-remote-check] [--verbose]
import { CompileService, type CompileResult } from "../src/lib/latex/compile.ts";
import { tectonicEngine } from "../src/lib/latex/engine.ts";
import { goldenFailures } from "../src/lib/latex/log.ts";
import { serializePaper } from "../src/lib/latex/serialize.ts";
import {
  assertRemoteBundlePinned,
  bundleCacheState,
  installTectonic,
} from "../src/lib/latex/tectonic.ts";
import {
  FANCYHDR_DOCUMENT,
  PACKAGES_DOCUMENT,
  fontsDocument,
  warmUpPapers,
} from "../src/lib/latex/warmup.ts";
import { dataPaths, getDataDir } from "../src/lib/paths.ts";

const log = (msg: string) => console.log(`[setup] ${msg}`);
const verbose = process.argv.includes("--verbose");

function fail(msg: string): never {
  console.error(`[setup] FAILED: ${msg}`);
  process.exit(1);
}

function report(name: string, r: CompileResult): void {
  const errors = r.diagnostics.filter((d) => d.severity === "error");
  if (!r.ok) fail(`${name} did not compile:\n${errors.map((e) => `  ${e.message}`).join("\n")}`);
  const notes = goldenFailures(r.diagnostics);
  // The warm-up documents touch every font size and shape on purpose, so
  // substitution and box notes are expected; list them only with --verbose.
  log(
    `${name}: ok in ${r.durationMs} ms${notes.length ? ` (${notes.length} expected notes)` : ""}`,
  );
  if (verbose) for (const n of notes) log(`  note: ${n.message}`);
}

async function main(): Promise<void> {
  const paths = dataPaths(getDataDir());
  log(`Data folder: ${paths.root}`);
  const binary = await installTectonic({ tectonicDir: paths.tectonicDir, log });

  if (process.argv.includes("--skip-remote-check")) {
    log("Skipping the upstream bundle check (--skip-remote-check).");
  } else {
    log("Checking the LaTeX package bundle against the pinned digest…");
    await assertRemoteBundlePinned();
    log("Bundle digest matches the pin.");
  }

  const docs: Array<[string, string]> = [
    ["packages", PACKAGES_DOCUMENT],
    ["fancyhdr", FANCYHDR_DOCUMENT],
    ["fonts", fontsDocument()],
  ];
  warmUpPapers().forEach((paper, i) => {
    const r = serializePaper(paper);
    if (!r.ok) fail(`warm-up paper ${i + 1}: ${r.issues.map((x) => x.message).join("; ")}`);
    docs.push([`warm-up paper ${i + 1}`, r.tex]);
  });

  const engine = tectonicEngine({ binary, cacheDir: paths.tectonicCache });
  const rate = { jobs: 1_000, perMs: 1 };
  log("Warming the package cache (the first run downloads packages; this can take a few minutes)…");
  const online = new CompileService({
    engine,
    offlineFirst: false,
    timeoutMs: 15 * 60_000,
    rateLimit: rate,
    concurrency: 1,
  });
  for (const [name, tex] of docs) report(name, await online.compile({ userId: "setup", tex }));

  const state = bundleCacheState(paths.tectonicCache);
  if (state !== "ok")
    fail(`the package cache is ${state === "missing" ? "missing" : "from a different bundle"}.`);
  log("Package cache was filled from the pinned bundle.");

  log("Checking that everything now compiles offline…");
  const offline = new CompileService({ engine, allowNetwork: false, rateLimit: rate });
  for (const [name, tex] of docs)
    report(`${name} (offline)`, await offline.compile({ userId: "setup", tex }));
  log("Done. DRAFTEX can compile papers without the internet.");
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
