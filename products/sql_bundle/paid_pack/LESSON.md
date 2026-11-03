# Turn customer and job data into reports
## Start a separate practice database
From the course folder run `sqlite3 -bail jobs_practice_01.db` with a new filename. Inside SQLite enter `.bail on`, `.headers on`, `.mode column`, then `.read paid_pack/setup.sql`. Do not run the free setup in this database. Expect four customers and five jobs. Check with `SELECT COUNT(*) FROM customers;` and `SELECT COUNT(*) FROM jobs;`.

## Session 1 Design the relationship
Read setup.sql comments. A customer can have several jobs. customer_id in jobs points to customers; this is a foreign key. Enable enforcement on every connection with `PRAGMA foreign_keys = ON;` before BEGIN. `PRAGMA foreign_keys;` should return 1. Run `PRAGMA foreign_key_check;`; no rows means no detected violations.

NOT NULL requires values; CHECK enforces permitted statuses and bounded whole-cent amounts. SQLite uses flexible typing, so the amount check includes typeof. These simplified tables do not enforce unique emails or valid calendar dates. Do not assume that any text date is valid just because it was accepted.

Task: list all jobs for customer 1. Expect jobs 101 and 102. Explain why the job stores the customer's identifier rather than copying the business name into every job.

## Session 2 Filter and total
Run reports_starter.sql using `.read paid_pack/reports_starter.sql`. Change quoted to completed. Expect jobs 101, 103 and 105. Add a query totaling completed job value. Amounts are cents: 15000 means $150.00. The completed total is 50000 cents, or $500.00.

SUM adds values; COUNT counts rows. GROUP BY produces one result per group. WHERE filters rows before grouping, while HAVING filters groups afterward. The completed value is not proof anyone paid; this dataset does not track payments.

Task: count jobs by status. Predict one cancelled, three completed and one quoted. Compare with report 3 in reports_solution.sql. For a sum with no matches, SUM returns NULL; COALESCE converts it to the display value zero when appropriate.

## Session 3 Join customer names to jobs
Run `.read paid_pack/reports_solution.sql`. A JOIN relates rows by the ON condition. Inner JOIN keeps matches only. LEFT JOIN keeps all customers and fills unmatched job columns with NULL.

Study report 4: the completed condition belongs in ON because customers without completed jobs must remain. Moving it to WHERE would remove those customers. COUNT(j.job_id) counts only matched jobs; COUNT(*) would also count a left-side row with no matching job. Group by customer_id as well as business_name so two customers with the same name are not accidentally merged.

Task: find the customer with zero jobs. Use a LEFT JOIN of all jobs and `WHERE j.job_id IS NULL`. Expect Pine Office. Then explain why Frost Studio still has one completed job even though it also has a cancelled job.

## Session 4 Practice controlled edits
Run `.read paid_pack/changes_practice.sql`. Read the comments before running it. It previews a row, changes its status, inserts and deletes a temporary job, and rolls everything back. Expect job 102 to be quoted afterward and the total job count to remain five.

UPDATE changes rows; DELETE removes rows. Both need an intentional WHERE condition for this lesson. BEGIN starts a transaction, COMMIT keeps it, and ROLLBACK undoes it. An SQL error does not necessarily undo an entire transaction automatically. If a practice error leaves the session open, run ROLLBACK before continuing. If a script fails and the shell exits, its uncommitted transaction is rolled back when the connection closes.

Do not remove the ROLLBACK in this exercise. To experiment further, use a new practice database. Applications should pass user data as bound parameters rather than building SQL by concatenating input; interactive SQL practice does not teach a production application input layer.

## Practice and assessment
A. Find completed jobs worth at least 15000 cents.
B. Find customers with no email.
C. List jobs on or after 2026-10-04 and before 2026-10-07. ISO text date order works for these consistently formatted dates.
D. Show customers with completed totals of at least 20000 cents.
E. Run changes_practice.sql twice. Confirm job 102 is still quoted and five jobs remain.
F. Export a completed-jobs report using the cheat sheet. Open it and check the header and three records.

You pass when you can explain the relationship, get the $500.00 completed total, keep customers with zero matching jobs and demonstrate rollback. Check answers.md after trying the tasks.

## Common errors
Foreign key constraint failed: confirm the parent customer exists and check the identifier. UNIQUE constraint failed: check whether that id is already present. CHECK constraint failed: inspect the permitted statuses or whole-cent amount rules. Cannot start a transaction within a transaction: inspect the previous error and use ROLLBACK if you are abandoning the unfinished practice transaction. Database locked: close other editing sessions before retrying; do not delete database sidecar files. No such table: confirm the filename and setup script with `.databases` and `.tables`.
