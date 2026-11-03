-- AlterTable
ALTER TABLE "Template" ADD COLUMN "seedKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Template_seedKey_key" ON "Template"("seedKey");

