-- Run once in a fresh practice database, not the post-report database.
BEGIN TRANSACTION;
CREATE TABLE content_plan (
    plan_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    format TEXT NOT NULL CHECK(format IN ('video', 'photo', 'carousel')),
    planned_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('idea', 'draft', 'ready', 'published'))
);
-- These dates are fictional ISO-formatted text. SQLite TEXT alone does not validate dates.
INSERT INTO content_plan VALUES
    (1, 'Desk setup tour', 'video', '2026-10-29', 'ready'),
    (2, 'Sketch timelapse', 'video', '2026-10-30', 'draft'),
    (3, 'Weekend photo walk', 'carousel', '2026-11-01', 'idea'),
    (4, 'October favorites', 'photo', '2026-10-28', 'published');
COMMIT;

-- A half-open date window: include the start, exclude the end.
SELECT plan_id, title, format, planned_date, status FROM content_plan
WHERE planned_date >= '2026-10-29' AND planned_date < '2026-11-02'
ORDER BY planned_date, plan_id;

-- Preview a specific row, make a practice edit, inspect it, then undo it.
BEGIN TRANSACTION;
SELECT plan_id, status FROM content_plan WHERE plan_id = 2;
UPDATE content_plan SET status = 'ready' WHERE plan_id = 2;
SELECT plan_id, status FROM content_plan WHERE plan_id = 2;
-- ROLLBACK preserves the original draft status. Do not replace it for this exercise.
ROLLBACK;
SELECT plan_id, status FROM content_plan WHERE plan_id = 2;
