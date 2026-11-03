-- START HERE after running setup.sql in a new starter database.
-- Run with .read free_starter/queries_starter.sql
-- SELECT lists the columns to display; FROM names their table.
SELECT business_name, city
FROM customers
-- PRACTICE 1: change Longmont to Boulder, keeping the single quotes.
WHERE city = 'Longmont'
-- PRACTICE 2: add DESC after business_name to reverse the name order.
ORDER BY business_name;

-- PRACTICE 3: below this comment, write a new SELECT using COUNT(*).
-- Hint: the table is customers; end the statement with a semicolon.
