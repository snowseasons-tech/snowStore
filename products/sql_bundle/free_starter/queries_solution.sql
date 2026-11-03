-- RUN after setup: .read free_starter/queries_solution.sql
-- SELECT chooses columns; FROM chooses the table. A semicolon ends SQL.
SELECT customer_id, business_name, city, email
FROM customers
-- ORDER BY gives a predictable order; ASC means ascending.
ORDER BY customer_id ASC;

-- WHERE filters rows before displaying them. Text uses single quotes.
-- EDIT HERE: try Boulder instead of Longmont, then run this file again.
SELECT business_name, city
FROM customers
WHERE city = 'Longmont'
ORDER BY business_name;

-- COUNT(*) counts rows, even if some columns contain NULL.
-- AS gives the displayed column a readable name.
SELECT COUNT(*) AS customer_count
FROM customers;
