# SQL and SQLite Command Cheat Sheet
Snow Seasons Tech • Uses the paid pack schema unless stated otherwise

## Know where to type
Terminal commands launch SQLite. SQL statements run at its prompt and end with a semicolon. SQLite dot commands also run at its prompt, start on their own line, and do not use semicolons. SQL keywords are shown uppercase for readability; table and column names follow the lesson schema.

## Terminal commands
| Command | Purpose |
| --- | --- |
| `sqlite3 --version` | Check the command line shell version. |
| `sqlite3 -bail jobs_practice_01.db` | Open a practice file or create it if absent; stop on errors. Choose a new filename for setup. |
| `sqlite3 -readonly jobs_practice_01.db` | Open an existing database read-only for reports. Export files can still be written by shell commands. |

## SQLite shell commands
| Command | Purpose |
| --- | --- |
| `.help` | Show available shell commands. |
| `.databases` | Display open databases and file locations. |
| `.tables` | List tables. |
| `.schema customers` | Show the customers table definition. |
| `.headers on` | Show column headings. |
| `.mode column` | Display aligned columns. |
| `.bail on` | Stop processing after an error. |
| `.read paid_pack/setup.sql` | Run paid setup once in a fresh database. |
| `.read paid_pack/reports_solution.sql` | Run the completed reports after setup. |
| `.read paid_pack/changes_practice.sql` | Run the edit exercise; it ends with rollback. |
| `.quit` | Close SQLite. |

If SQL is waiting for more text, finish the statement rather than typing a dot command in its middle. A continued prompt usually means an unfinished quote, parenthesis or missing semicolon.

## Read and filter data
| SQL | Purpose |
| --- | --- |
| `SELECT business_name, city FROM customers;` | Display selected columns for all customers. |
| `SELECT * FROM customers;` | Inspect all columns; explicit names make saved reports clearer. |
| `SELECT business_name FROM customers WHERE city = 'Longmont';` | Filter text by equality. |
| `SELECT job_id FROM jobs WHERE status = 'completed' AND amount_cents >= 15000;` | Require both conditions. |
| `SELECT job_id FROM jobs WHERE status IN ('quoted', 'completed');` | Match one of several values. |
| `SELECT business_name FROM customers WHERE email IS NULL;` | Find missing email values. |
| `SELECT business_name FROM customers WHERE business_name LIKE 'Aspen%';` | Find a name beginning with Aspen; % matches zero or more characters. Case behavior varies by database and settings. |
| `SELECT job_id, amount_cents FROM jobs ORDER BY amount_cents DESC, job_id LIMIT 3;` | Show the three largest values, breaking ties by id. |

Comparison operators: = equals, <> differs, > greater, >= at least, < less, <= at most. AND requires both conditions; OR requires at least one. Use parentheses when combining them to make intent clear. NULL is unknown: use IS NULL or IS NOT NULL, not = NULL. Text uses single quotes; escape an apostrophe by doubling it: 'Owner''s Office'.

## Count, total and group
```sql
-- Count rows, including those with missing values in individual columns.
SELECT COUNT(*) AS customer_count FROM customers;

-- Add completed values; COALESCE produces zero if there are no matches.
SELECT COALESCE(SUM(amount_cents), 0) AS completed_value_cents
FROM jobs WHERE status = 'completed';

-- Group first, then keep groups meeting a condition.
SELECT status, COUNT(*) AS job_count, SUM(amount_cents) AS value_cents
FROM jobs
GROUP BY status
HAVING COUNT(*) >= 1
ORDER BY status;
```

Written clause order: SELECT, FROM and JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT. WHERE selects rows; HAVING selects groups. COUNT(column) excludes NULL in that column; COUNT(*) counts rows.

## Join related tables
```sql
-- Match each job to its customer.
SELECT j.job_id, c.business_name, j.amount_cents
FROM jobs AS j
JOIN customers AS c ON c.customer_id = j.customer_id
ORDER BY j.job_id;

-- Preserve all customers, including those with no completed jobs.
SELECT c.customer_id, c.business_name,
       COUNT(j.job_id) AS completed_jobs,
       COALESCE(SUM(j.amount_cents), 0) AS completed_value_cents
FROM customers AS c
LEFT JOIN jobs AS j
    ON j.customer_id = c.customer_id AND j.status = 'completed'
GROUP BY c.customer_id, c.business_name
ORDER BY c.customer_id;
```

## Change practice data inside a transaction
Use the fictional paid database. The following example deliberately undoes its change:
```sql
-- Enable related-table rules on each connection, before BEGIN.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
-- Preview the exact row first.
SELECT job_id, status FROM jobs WHERE job_id = 102;
UPDATE jobs SET status = 'completed' WHERE job_id = 102;
SELECT job_id, status FROM jobs WHERE job_id = 102;
-- Undo this practice change.
ROLLBACK;
```

COMMIT keeps a transaction; ROLLBACK undoes it. Do not replace rollback in the course edit exercise. If an error leaves an interactive transaction open, run ROLLBACK before starting over. An individual statement failure may leave prior statements pending.

INSERT adds rows. DELETE removes matching rows. Runnable examples with preview queries and rollback are in paid_pack/changes_practice.sql. UPDATE or DELETE without WHERE can affect every row. CREATE TABLE defines a table; DROP TABLE removes it and its stored rows. DROP is not required for this course.

## Export a report to CSV
At the SQLite prompt in the paid database:
```
.headers on
.mode csv
.once completed_jobs_report_01.csv
SELECT job_id, customer_id, amount_cents FROM jobs WHERE status = 'completed' ORDER BY job_id;
.mode column
```
Use a new output filename to keep earlier exports: .once can replace an existing file. The CSV is written relative to the terminal's starting folder unless you provide a full path. The header plus three job records should appear. A CSV report does not preserve tables, constraints or the whole database.

## Back up and check a practice database
Use a new destination filename to preserve previous backups. At the SQLite prompt:
```
.backup jobs_backup_01.db
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```
integrity_check should return ok; foreign_key_check should return no rows. They check different things. Exit and open the backup with `sqlite3 -readonly jobs_backup_01.db`. Run `SELECT COUNT(*) FROM jobs;` and `SELECT SUM(amount_cents) FROM jobs WHERE status = 'completed';`. Expect 5 and 50000 for the original paid dataset. Read-only mode prevents these SQL data edits; the backup remains on the same device unless separately copied elsewhere.

## SQL dialect notes
SQLite dot commands and PRAGMA are not portable SQL. PostgreSQL and MySQL have their own shells, types, identity columns and administration commands. Do not assume a SQLite script runs unchanged elsewhere. Application user input belongs in bound query parameters, not concatenated SQL strings.

## Official references
- SQLite shell: https://www.sqlite.org/cli.html
- SELECT: https://www.sqlite.org/lang_select.html
- Transactions: https://www.sqlite.org/lang_transaction.html
- Foreign keys: https://www.sqlite.org/foreignkeys.html
