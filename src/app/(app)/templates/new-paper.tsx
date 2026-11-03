"use client";
import { FilePlus2 } from "lucide-react";
import { buttonStyles } from "@/components/styles";
import { createPaperAction } from "@/server/paper-actions";
import { type CourseChoice, PaperFormDialog, currentAcademicYear } from "../papers/paper-form";

/** "New paper from this template": asks for the course and date, then opens the editor. */
export function NewPaperButton({
  templateId,
  templateTitle,
  courses,
  unit,
}: {
  templateId: string;
  templateTitle: string;
  courses: CourseChoice[];
  unit: "Semester" | "Year";
}) {
  return (
    <PaperFormDialog
      trigger={
        <button type="button" className={buttonStyles.primary}>
          <FilePlus2 aria-hidden size={16} />
          New paper
        </button>
      }
      heading="New paper"
      description={`Uses “${templateTitle}”. The paper keeps its own copy of the template, so later changes to the template do not change it.`}
      initial={{
        title: "",
        courseId: null,
        courseCode: "",
        courseTitle: "",
        semesterOrYear: 1,
        academicYear: currentAcademicYear(),
        examDate: null,
      }}
      courses={courses}
      unit={unit}
      submitLabel="Create paper"
      pendingLabel="Creating…"
      onSubmit={(v) => createPaperAction(templateId, v)}
    />
  );
}
