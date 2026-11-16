-- CreateTable
CREATE TABLE "Blueprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "examGroup" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "tolerance" REAL NOT NULL,
    "targets" JSONB NOT NULL,
    "sharing" TEXT NOT NULL DEFAULT 'PRIVATE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Blueprint_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Blueprint_courseCode_examGroup_idx" ON "Blueprint"("courseCode", "examGroup");

-- CreateIndex
CREATE UNIQUE INDEX "Blueprint_ownerId_courseCode_examGroup_key" ON "Blueprint"("ownerId", "courseCode", "examGroup");

