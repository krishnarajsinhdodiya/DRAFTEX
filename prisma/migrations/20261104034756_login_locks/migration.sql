/*
  Warnings:

  - You are about to drop the column `failedLogins` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lockedUntil` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "detail" TEXT;

-- CreateTable
CREATE TABLE "LoginLock" (
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "address"),
    CONSTRAINT "LoginLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'FACULTY',
    "institution" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "allowAdvancedLatex" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("allowAdvancedLatex", "createdAt", "email", "id", "institution", "isActive", "mustChangePassword", "name", "passwordHash", "role", "updatedAt") SELECT "allowAdvancedLatex", "createdAt", "email", "id", "institution", "isActive", "mustChangePassword", "name", "passwordHash", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LoginLock_updatedAt_idx" ON "LoginLock"("updatedAt");
