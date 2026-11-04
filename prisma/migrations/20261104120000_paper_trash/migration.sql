-- AlterTable
ALTER TABLE "Paper" ADD COLUMN "deletedAt" DATETIME;

-- DropIndex
DROP INDEX "Paper_ownerId_idx";

-- CreateIndex
CREATE INDEX "Paper_ownerId_deletedAt_idx" ON "Paper"("ownerId", "deletedAt");
