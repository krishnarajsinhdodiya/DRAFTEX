import pkg from "../../package.json";
import { TECTONIC_VERSION } from "./latex/pins";

export const appInfo = {
  name: "DRAFTEX",
  tagline: "Question papers and answer keys, typeset properly.",
  /** package.json; set to the phase tag (v0.<n>.0) when a phase is merged. */
  version: pkg.version,
  /** Shown on every screen of the app, never on printed papers (owner decision). */
  creator: "Krishnarajsinh Hitesh Dodiya",
  madeFor: "Faculty of K B Institute of Pharmaceutical Education & Research, Gandhinagar",
  engine: `Tectonic ${TECTONIC_VERSION}`,
} as const;

export const creditLine = `Made by ${appInfo.creator}`;
