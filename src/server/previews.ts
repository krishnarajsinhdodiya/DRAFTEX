// The app's preview pipeline: one cache, the shared compile service.
import { getData } from "@/lib/data";
import { dataPaths, defaultDeps, getDataDir } from "@/lib/paths";
import { getCompileService } from "./compile";
import type { ExportDeps } from "./export";
import { type ResolveImages, imageResolver } from "./images";
import { type PaperPreviewDeps, paperPreviewCache } from "./paper-preview";
import { PreviewCache, type PreviewDeps } from "./template-preview";

const globalForPreview = globalThis as unknown as {
  draftexPreview?: PreviewDeps;
  draftexPaperCache?: PaperPreviewDeps["cache"];
};

/* v8 ignore start -- process-wide wiring */
export function previewDeps(): PreviewDeps {
  globalForPreview.draftexPreview ??= {
    compile: getCompileService(),
    images: appImages(),
    cache: new PreviewCache(),
  };
  return globalForPreview.draftexPreview;
}

export async function paperPreviewDeps(): Promise<PaperPreviewDeps> {
  globalForPreview.draftexPaperCache ??= paperPreviewCache();
  return {
    data: await getData(),
    compile: getCompileService(),
    images: appImages(),
    cache: globalForPreview.draftexPaperCache,
  };
}

export async function exportDeps(): Promise<ExportDeps> {
  return {
    data: await getData(),
    compile: getCompileService(),
    images: appImages(),
    exportsDir: dataPaths(getDataDir()).exports,
  };
}

export function appImages(): ResolveImages {
  return imageResolver({
    repoRoot: defaultDeps().repoRoot,
    assetsDir: dataPaths(getDataDir()).assets,
    ownAsset: async (ownerId, sha256) =>
      (await getData()).assets.get({ userId: ownerId, role: "FACULTY" }, sha256).catch(() => null),
  });
}
/* v8 ignore stop */
