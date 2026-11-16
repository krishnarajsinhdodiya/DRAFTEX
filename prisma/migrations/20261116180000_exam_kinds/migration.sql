-- D131: PRACTICAL_SESSIONAL becomes PRACTICAL_SESSIONAL_1 (a second practical
-- sessional, PRACTICAL_SESSIONAL_2, is a new enum value; SQLite stores enums as text).
UPDATE "Paper" SET "examKind" = 'PRACTICAL_SESSIONAL_1' WHERE "examKind" = 'PRACTICAL_SESSIONAL';
UPDATE "Template" SET "examKind" = 'PRACTICAL_SESSIONAL_1' WHERE "examKind" = 'PRACTICAL_SESSIONAL';
-- JSON copies are written by JSON.stringify (no spaces); the closing quote keeps
-- an already renamed value from matching twice.
UPDATE "Paper" SET "templateSnapshot" = replace("templateSnapshot", '"examKind":"PRACTICAL_SESSIONAL"', '"examKind":"PRACTICAL_SESSIONAL_1"')
  WHERE instr("templateSnapshot", '"examKind":"PRACTICAL_SESSIONAL"') > 0;
UPDATE "PaperSnapshot" SET "data" = replace("data", '"examKind":"PRACTICAL_SESSIONAL"', '"examKind":"PRACTICAL_SESSIONAL_1"')
  WHERE instr("data", '"examKind":"PRACTICAL_SESSIONAL"') > 0;

-- D134: blueprints are keyed by the exact exam, not the D59 exam group.
DROP INDEX "Blueprint_courseCode_examGroup_idx";
DROP INDEX "Blueprint_ownerId_courseCode_examGroup_key";
ALTER TABLE "Blueprint" RENAME COLUMN "examGroup" TO "examKind";
UPDATE "Blueprint" SET "examKind" = CASE "examKind"
  WHEN 'SESSIONAL' THEN 'SESSIONAL_1'
  WHEN 'END_SEMESTER' THEN 'END_SEMESTER'
  WHEN 'PRACTICAL' THEN 'PRACTICAL_SESSIONAL_1'
  WHEN 'ATKT' THEN 'SUPPLEMENTARY_ATKT'
  ELSE 'CUSTOM' END;
CREATE INDEX "Blueprint_courseCode_examKind_idx" ON "Blueprint"("courseCode", "examKind");
CREATE UNIQUE INDEX "Blueprint_ownerId_courseCode_examKind_key" ON "Blueprint"("ownerId", "courseCode", "examKind");
