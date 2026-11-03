# Find information in a customer list
## Your goal
Create a fictional customer list, find customers in a city and count records. A database stores related tables. A table has columns, such as city, and rows, such as one customer's record. SQL lets you ask specific questions without editing the underlying file by hand.

## 1 Create your practice database
Follow SETUP.md, including the new filename rule. Run free_starter/setup.sql once, then free_starter/queries_solution.sql. Expect four customers, two Longmont customers named Aspen Cleaning and Frost Studio, and a customer_count of 4. The .read command runs the file; do not paste its path as if it were SQL.

## 2 Read the setup comments
customer_id identifies a row. business_name and city contain text. email can be NULL when unknown. CREATE TABLE defines the structure; INSERT INTO adds records. Text uses straight single quotes. If a business name contains an apostrophe, double it inside the SQL string, as in 'Owner''s Office'.

BEGIN and COMMIT group setup changes. A transaction is a unit of work you can commit or undo. Setup deliberately refuses to recreate an existing customers table. If you see table already exists, reopen the intended database or use a fresh filename rather than deleting tables.

## 3 Ask a question
Read queries_starter.sql. SELECT chooses what to show, FROM chooses where to look, WHERE limits matching rows and ORDER BY controls their display order. A SELECT does not change the stored records. Run `.read free_starter/queries_starter.sql` inside SQLite.

## 4 Practice
A. Change Longmont to Boulder and predict the result before running.
B. Restore Longmont and sort names in descending order using DESC.
C. Add a query counting all customers.
D. Find customers whose email is missing using `WHERE email IS NULL`. Do not use `= NULL`.

## Answers
A. Cedar Repairs. B. Frost Studio followed by Aspen Cleaning. C. `SELECT COUNT(*) AS customer_count FROM customers;` returns 4. D. `SELECT business_name FROM customers WHERE email IS NULL;` returns Cedar Repairs. NULL means unknown; use IS NULL to test for it.

## Troubleshooting and completion
No such table: confirm the database filename and run `.tables`. No such column: compare spelling with `.schema customers`. Syntax error: check commas, quotes and the final semicolon. No output may simply mean no row matched the WHERE condition.

You are ready for the paid pack when you can select two columns, explain a filter and predict the count before running it.
