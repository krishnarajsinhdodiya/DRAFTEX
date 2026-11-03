// Logos that ship with the app (assets/logos/, tracked since the owner's
// first pack). Built-in templates use them; until uploads exist (Phase 5)
// they are the only images a template header may show.
export interface BuiltInLogo {
  id: "ksv" | "kbiper";
  label: string;
  sha256: string;
  ext: "png";
  /** Repo-relative path of the file. */
  file: string;
}

export const BUILT_IN_LOGOS: readonly BuiltInLogo[] = [
  {
    id: "ksv",
    label: "Kadi Sarva Vishwavidyalaya",
    sha256: "f847009ea404b1e13d6e7e2ad544f73ca3fdd8ea791dfdb795e6a4c9b431658c",
    ext: "png",
    file: "assets/logos/ksv-logo.png",
  },
  {
    id: "kbiper",
    label: "KBIPER",
    sha256: "4badd2a1a8619986868828e6f01583e3eda002fc607708a7239228e73ee0a086",
    ext: "png",
    file: "assets/logos/kbiper-logo.png",
  },
];

export function logoRef(id: BuiltInLogo["id"]): { sha256: string; ext: "png" } {
  const logo = BUILT_IN_LOGOS.find((l) => l.id === id) as BuiltInLogo;
  return { sha256: logo.sha256, ext: logo.ext };
}

export function builtInLogoBySha(sha256: string): BuiltInLogo | undefined {
  return BUILT_IN_LOGOS.find((l) => l.sha256 === sha256);
}
