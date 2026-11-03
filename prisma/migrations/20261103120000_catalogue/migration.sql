-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "semesterOrYear" INTEGER NOT NULL,
    "courseKind" TEXT NOT NULL,
    "credits" REAL NOT NULL,
    "lectureHrs" INTEGER NOT NULL,
    "tutorialHrs" INTEGER NOT NULL,
    "practicalHrs" INTEGER NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "sessionalMarks" INTEGER NOT NULL,
    "endSemMarks" INTEGER NOT NULL,
    "endSemMinutes" INTEGER NOT NULL,
    "ruleSetId" TEXT,
    "continuousMarks" INTEGER NOT NULL DEFAULT 0,
    "sessionalMinutes" INTEGER,
    "maxHours" INTEGER,
    "electiveOf" TEXT,
    "electiveLabel" TEXT,
    "syllabusPage" INTEGER
);
INSERT INTO "new_Course" ("code", "courseKind", "credits", "endSemMarks", "endSemMinutes", "id", "lectureHrs", "maxMarks", "practicalHrs", "program", "ruleSetId", "semesterOrYear", "sessionalMarks", "title", "tutorialHrs") SELECT "code", "courseKind", "credits", "endSemMarks", "endSemMinutes", "id", "lectureHrs", "maxMarks", "practicalHrs", "program", "ruleSetId", "semesterOrYear", "sessionalMarks", "title", "tutorialHrs" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

