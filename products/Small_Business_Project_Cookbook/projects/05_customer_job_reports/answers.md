# Practice answers
A. `SELECT job_id, amount_cents FROM jobs WHERE status = 'completed' AND amount_cents >= 15000 ORDER BY job_id;` returns 101 and 103.

B. `SELECT business_name FROM customers WHERE email IS NULL;` returns Cedar Repairs.

C. `SELECT job_id FROM jobs WHERE job_date >= '2026-10-04' AND job_date < '2026-10-07' ORDER BY job_id;` returns 103, 104 and 105.

D. Report 5 in reports_solution.sql returns Cedar Repairs at 22500 cents. Changing its threshold to 10000 adds Aspen Cleaning at 15000 and Frost Studio at 12500.

E. `SELECT status FROM jobs WHERE job_id = 102;` returns quoted. `SELECT COUNT(*) FROM jobs;` returns 5. ROLLBACK restores the original state, so a second run has the same result.

F. The completed report has job_ids 101, 103 and 105. The total of their amount_cents is 50000. CSV export is a report, not a full database backup.

Starter task 2: `SELECT COALESCE(SUM(amount_cents), 0) AS completed_value_cents FROM jobs WHERE status = 'completed';`

Starter task 3: `SELECT j.job_id, c.business_name FROM jobs AS j JOIN customers AS c ON c.customer_id = j.customer_id ORDER BY j.job_id;`

Starter task 4: `SELECT status, COUNT(*) AS job_count FROM jobs GROUP BY status ORDER BY status;`

Customers with no jobs: `SELECT c.business_name FROM customers AS c LEFT JOIN jobs AS j ON j.customer_id = c.customer_id WHERE j.job_id IS NULL;` returns Pine Office.
