-- Phase 16 (D112, D125, D126): full-text search over the question bank.
-- One FTS5 row per question, keyed by the question id (Question has a TEXT
-- primary key, so its rowid is not stable across VACUUM and is never used).
-- Trigram tokenizer: matches inside words ("butyl" in "isobutylphenyl"),
-- folds accents, treats % and _ as ordinary characters.
CREATE VIRTUAL TABLE "question_fts" USING fts5(
  question_id UNINDEXED,
  body,
  tokenize = 'trigram remove_diacritics 1'
);

-- body = question text, answer text, tags, course code and title, CO tags.
-- Kept in one expression per trigger; the three copies must stay identical.
CREATE TRIGGER "question_fts_ai" AFTER INSERT ON "Question" BEGIN
  INSERT INTO "question_fts" (question_id, body) VALUES (NEW.id,
    concat_ws(char(10),
      NEW.searchText,
      (SELECT group_concat(value, ' ') FROM json_tree(CASE WHEN json_valid(NEW.answerKey) THEN NEW.answerKey END) WHERE key = 'text' AND type = 'text'),
      (SELECT group_concat(value, ' ') FROM json_each(CASE WHEN json_valid(NEW.tags) THEN NEW.tags END) WHERE type = 'text'),
      NEW.courseCode, NEW.courseTitle, NEW.coTag));
END;

CREATE TRIGGER "question_fts_au" AFTER UPDATE OF searchText, answerKey, tags, courseCode, courseTitle, coTag ON "Question" BEGIN
  DELETE FROM "question_fts" WHERE question_id = OLD.id;
  INSERT INTO "question_fts" (question_id, body) VALUES (NEW.id,
    concat_ws(char(10),
      NEW.searchText,
      (SELECT group_concat(value, ' ') FROM json_tree(CASE WHEN json_valid(NEW.answerKey) THEN NEW.answerKey END) WHERE key = 'text' AND type = 'text'),
      (SELECT group_concat(value, ' ') FROM json_each(CASE WHEN json_valid(NEW.tags) THEN NEW.tags END) WHERE type = 'text'),
      NEW.courseCode, NEW.courseTitle, NEW.coTag));
END;

CREATE TRIGGER "question_fts_ad" AFTER DELETE ON "Question" BEGIN
  DELETE FROM "question_fts" WHERE question_id = OLD.id;
END;

-- Fill from the questions that already exist (upgrades and restores).
INSERT INTO "question_fts" (question_id, body)
SELECT q.id,
  concat_ws(char(10),
    q.searchText,
    (SELECT group_concat(value, ' ') FROM json_tree(CASE WHEN json_valid(q.answerKey) THEN q.answerKey END) WHERE key = 'text' AND type = 'text'),
    (SELECT group_concat(value, ' ') FROM json_each(CASE WHEN json_valid(q.tags) THEN q.tags END) WHERE type = 'text'),
    q.courseCode, q.courseTitle, q.coTag)
FROM "Question" q;
