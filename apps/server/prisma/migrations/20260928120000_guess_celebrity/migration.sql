-- Guess the Celebrity replaces Sound Sleuth (Phase 5 Batch 4).
-- Sound Sleuth content, team tasks and tries are removed; only sample and test games had them.
-- Hint and fail ledger rows stay, so wallet balances do not change; they lose their task link.
UPDATE "FundTransaction" SET "taskAttemptId" = NULL
WHERE "taskAttemptId" IN (
  SELECT a."id" FROM "TaskAttempt" a
  JOIN "TeamTask" t ON t."id" = a."teamTaskId"
  JOIN "TaskDefinition" d ON d."id" = t."taskDefinitionId"
  WHERE d."key" = 'sound_sleuth'
);

-- Deleting a team task deletes its tries (ON DELETE CASCADE).
DELETE FROM "TeamTask"
WHERE "taskDefinitionId" IN (SELECT "id" FROM "TaskDefinition" WHERE "key" = 'sound_sleuth');

DELETE FROM "TaskContent"
WHERE "taskDefinitionId" IN (SELECT "id" FROM "TaskDefinition" WHERE "key" = 'sound_sleuth');

UPDATE "TaskDefinition" SET "key" = 'guess_celebrity', "name" = 'Guess the Celebrity'
WHERE "key" = 'sound_sleuth';
