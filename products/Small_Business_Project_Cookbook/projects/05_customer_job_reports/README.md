# Recipe 05 Customer and job reports

**Outcome:** Join customer names to jobs and report completed job values while preserving customers with no matches.

**Languages:** SQL with SQLite. **Time:** 60–90 minutes.

**Files:** [projects/05_customer_job_reports](projects/05_customer_job_reports/).

### Ingredients

SQLite command line shell with foreign key support. The source is adapted from the SQL lesson pack. The README in this recipe is the cookbook-specific launch guide.

### Method

1. From the cookbook root open a new practice file: `sqlite3 -bail cookbook_jobs_01.db`. Use a new filename if already used.
2. At the SQLite prompt enter `.bail on`, `.headers on` and `.mode column` on separate lines.
3. Run `.read projects/05_customer_job_reports/setup.sql`, then `.read projects/05_customer_job_reports/reports_solution.sql`.
4. Read the joins and GROUP BY clauses. Run `.read projects/05_customer_job_reports/changes_practice.sql` to see temporary edits rolled back.

### Expected result

Four customers, five jobs and completed job value 50000 cents ($500.00). The completed-customer report retains Pine Office with zero matching jobs.

### Make it your own

Change the grouped-report threshold from 20000 to 10000 cents in a copy. Answer: Cedar Repairs, Aspen Cleaning and Frost Studio qualify. Explain why COUNT(j.job_id), rather than COUNT(*), is used after the LEFT JOIN.

### Error handling and limits

Keep foreign keys enabled on each connection. If a script error leaves an interactive transaction open, enter ROLLBACK before starting over. Completed job value is not necessarily cash collected or recognized revenue. SQL shell dot commands are not portable to PostgreSQL or MySQL.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.
