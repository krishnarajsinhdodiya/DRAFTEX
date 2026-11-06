"use client";
import { Settings2 } from "lucide-react";
import { buttonStyles } from "@/components/styles";
import { updatePaperDetailsAction } from "@/server/paper-actions";
import type { PaperEditorView } from "@/server/paper-view";
import { PaperFormDialog } from "../paper-form";

export function DetailsButton({ view }: { view: PaperEditorView }) {
  return (
    <PaperFormDialog
      trigger={
        <button type="button" className={buttonStyles.quiet}>
          <Settings2 size={15} aria-hidden /> <span className="max-sm:sr-only">Details</span>
        </button>
      }
      heading="Paper details"
      description="What the header prints: course, date and year. The layout comes from the template."
      initial={{
        title: view.title,
        courseId: view.courseId,
        courseCode: view.courseCode,
        courseTitle: view.courseTitle,
        semesterOrYear: view.semesterOrYear,
        academicYear: view.academicYear,
        examDate: view.examDate,
        showBloom: view.showBloom,
      }}
      courses={view.courses}
      unit={view.program === "PHARM_D" ? "Year" : "Semester"}
      submitLabel="Save details"
      pendingLabel="Saving…"
      onSubmit={(v) => updatePaperDetailsAction(view.id, view.version, v)}
    />
  );
}
