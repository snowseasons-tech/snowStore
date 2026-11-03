-- RUN ONLY in the fictional paid database: .read paid_pack/changes_practice.sql
-- Practice changes are deliberately rolled back so this file is repeatable.
-- If an error interrupts this file in an open session, run ROLLBACK; yourself.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- First preview the exact row we intend to change.
SELECT job_id, status FROM jobs WHERE job_id = 102;
-- WHERE restricts the change to one job. Without WHERE all jobs could change.
UPDATE jobs SET status = 'completed' WHERE job_id = 102;
-- Inspect the result BEFORE deciding whether to keep the transaction.
SELECT job_id, status FROM jobs WHERE job_id = 102;

-- INSERT supplies a new row. The id must not already exist.
INSERT INTO jobs (job_id, customer_id, status, amount_cents, job_date)
VALUES (106, 4, 'quoted', 5000, '2026-10-07');
SELECT job_id, customer_id, status FROM jobs WHERE job_id = 106;

-- DELETE removes matching rows. Preview its WHERE condition first.
SELECT job_id FROM jobs WHERE job_id = 106;
DELETE FROM jobs WHERE job_id = 106;
-- COUNT should be zero now for this temporary job.
SELECT COUNT(*) AS remaining_temporary_jobs FROM jobs WHERE job_id = 106;

-- Undo ALL changes made since BEGIN, including the status update.
-- Leave ROLLBACK in place for this lesson; do not replace it with COMMIT.
ROLLBACK;
-- Job 102 should be quoted again; the original five jobs remain.
SELECT job_id, status FROM jobs WHERE job_id = 102;
