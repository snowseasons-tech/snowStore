-- RUN after paid setup: .read paid_pack/reports_starter.sql
-- Start with a working query. Edit and rerun; SELECT does not change records.
SELECT job_id, customer_id, status, amount_cents
FROM jobs
-- TASK 1: change quoted to completed. How many rows will match?
WHERE status = 'quoted'
ORDER BY job_id;

-- TASK 2: add a SELECT that sums completed job amounts using SUM.
-- Hint: use WHERE before GROUP BY, if your query has a GROUP BY.

-- TASK 3: join customers to jobs using customer_id and show business_name.
-- Hint: FROM jobs AS j JOIN customers AS c ON c.customer_id = j.customer_id

-- TASK 4: count jobs by status. Use GROUP BY status and COUNT(*).
-- Compare your results with reports_solution.sql after trying each task.
