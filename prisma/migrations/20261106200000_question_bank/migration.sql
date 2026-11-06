-- CreateTable
CREATE TABLE "QuestionUse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paperId" TEXT,
    "paperTitle" TEXT NOT NULL,
    "usedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionUse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionUse_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankCourseShare" (
    "ownerId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("ownerId", "courseCode"),
    CONSTRAINT "BankCourseShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "courseId" TEXT,
    "courseCode" TEXT,
    "courseTitle" TEXT,
    "program" TEXT,
    "unit" INTEGER,
    "coTag" TEXT,
    "bloomLevel" TEXT,
    "marks" REAL,
    "type" TEXT,
    "content" JSONB,
    "answerKey" JSONB,
    "keyCriteria" JSONB,
    "tags" JSONB,
    "dupKey" TEXT,
    "searchText" TEXT,
    "sharing" TEXT NOT NULL DEFAULT 'PRIVATE',
    "sourcePaperId" TEXT,
    "updatedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" DATETIME,
    CONSTRAINT "Question_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Question_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Question_sourcePaperId_fkey" FOREIGN KEY ("sourcePaperId") REFERENCES "Paper" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("createdAt", "id", "ownerId") SELECT "createdAt", "id", "ownerId" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
CREATE INDEX "Question_ownerId_idx" ON "Question"("ownerId");
CREATE INDEX "Question_ownerId_courseCode_dupKey_idx" ON "Question"("ownerId", "courseCode", "dupKey");
CREATE INDEX "Question_courseCode_sharing_idx" ON "Question"("courseCode", "sharing");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "QuestionUse_questionId_userId_usedAt_idx" ON "QuestionUse"("questionId", "userId", "usedAt");

-- CreateIndex
CREATE INDEX "QuestionUse_userId_idx" ON "QuestionUse"("userId");

-- CreateIndex
CREATE INDEX "BankCourseShare_courseCode_idx" ON "BankCourseShare"("courseCode");

