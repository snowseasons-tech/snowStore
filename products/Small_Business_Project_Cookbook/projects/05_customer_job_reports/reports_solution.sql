-- READ ONLY: rerun these reports without changing stored data.
-- RUN: .read paid_pack/reports_solution.sql

-- 1. JOIN matches jobs to customers using their shared customer identifier.
-- c and j are short aliases; AS assigns a name to a table or output column.
SELECT j.job_id, c.business_name, j.status, j.amount_cents, j.job_date
FROM jobs AS j
JOIN customers AS c ON c.customer_id = j.customer_id
ORDER BY j.job_id;

-- 2. Filter completed jobs before adding their amounts.
-- COALESCE returns zero instead of NULL when no rows match SUM.
-- This is completed job value, not payment receipts or recognized revenue.
SELECT COALESCE(SUM(amount_cents), 0) AS completed_value_cents
FROM jobs
WHERE status = 'completed';

-- 3. GROUP BY creates one result per status, with a count and value total.
SELECT status, COUNT(*) AS job_count, SUM(amount_cents) AS value_cents
FROM jobs
GROUP BY status
ORDER BY status;

-- 4. LEFT JOIN keeps customers even if they have no completed jobs.
-- Put the completed filter in ON so zero-job customers remain in the report.
-- COUNT(j.job_id) counts only matched jobs; COUNT(*) would count empty matches.
SELECT c.customer_id, c.business_name,
       COUNT(j.job_id) AS completed_job_count,
       COALESCE(SUM(j.amount_cents), 0) AS completed_value_cents
FROM customers AS c
LEFT JOIN jobs AS j
    ON j.customer_id = c.customer_id AND j.status = 'completed'
GROUP BY c.customer_id, c.business_name
ORDER BY c.customer_id;

-- 5. HAVING filters groups after their totals are calculated.
-- PRACTICE: change 20000 to 10000 and predict the extra customers.
SELECT c.business_name, SUM(j.amount_cents) AS completed_value_cents
FROM customers AS c
JOIN jobs AS j ON j.customer_id = c.customer_id
WHERE j.status = 'completed'
GROUP BY c.customer_id, c.business_name
HAVING SUM(j.amount_cents) >= 20000
ORDER BY completed_value_cents DESC, c.customer_id;
