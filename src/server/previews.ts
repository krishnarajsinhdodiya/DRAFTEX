// The app's preview pipeline: one cache, the shared compile service.
import { defaultDeps } from "@/lib/paths";
import { getCompileService } from "./compile";
import { PreviewCache, type PreviewDeps } from "./template-preview";

const globalForPreview = globalThis as unknown as { draftexPreview?: PreviewDeps };

/* v8 ignore start -- process-wide wiring */
export function previewDeps(): PreviewDeps {
  globalForPreview.draftexPreview ??= {
    compile: getCompileService(),
    repoRoot: defaultDeps().repoRoot,
    cache: new PreviewCache(),
  };
  return globalForPreview.draftexPreview;
}
/* v8 ignore stop */
