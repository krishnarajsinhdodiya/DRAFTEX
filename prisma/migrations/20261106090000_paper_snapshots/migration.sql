-- AlterTable
ALTER TABLE "Paper" ADD COLUMN "printedAt" DATETIME;

-- CreateTable
CREATE TABLE "PaperSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperSnapshot_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PaperSnapshot_paperId_createdAt_idx" ON "PaperSnapshot"("paperId", "createdAt");

