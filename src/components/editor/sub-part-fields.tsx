"use client";
// What a sub-part's own fields need from the question around it (D65, D66):
// the CO choices, whether CO tags are printed, and the question's own values,
// which an unset sub-part value follows. Provided by the slot card; editors
// without it (the answer key) show no sub-part fields.
import { createContext, useContext } from "react";
import type { Bloom } from "@/lib/paper/bloom";

export interface SubPartFields {
  /** e.g. "Q.2(3)": names the fields for screen readers. */
  questionName: string;
  coOptions: { value: string; label: string }[];
  showCo: boolean;
  questionCo: string | null;
  questionBloom: Bloom | null;
}

export const SubPartFieldsContext = createContext<SubPartFields | null>(null);

export function useSubPartFields(): SubPartFields | null {
  return useContext(SubPartFieldsContext);
}
