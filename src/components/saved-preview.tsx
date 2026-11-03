"use client";
// Preview of a saved template: fetched once when the page opens.
import { useEffect, useState } from "react";
import { PdfView, type PreviewState, fetchPdf } from "./pdf-view";

export function SavedPreview({ url, label }: { url: string; label: string }) {
  const [state, setState] = useState<PreviewState>({ pdf: null, busy: true, error: null });
  useEffect(() => {
    const ctl = new AbortController();
    fetchPdf(url, { signal: ctl.signal }).then((r) => {
      if (r.ok) setState({ pdf: r.pdf, busy: false, error: null });
      else if (!r.superseded)
        setState((s) => ({ ...s, busy: false, error: { message: r.message, details: r.details } }));
    });
    return () => ctl.abort();
  }, [url]);
  return <PdfView state={state} label={label} />;
}
