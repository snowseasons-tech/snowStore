-- Run ONCE in a NEW practice database with .read receivables.sql
-- This exercise tracks fictional invoice balances; it does not send or collect money.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
CREATE TABLE invoices (
    invoice_id INTEGER PRIMARY KEY,
    customer TEXT NOT NULL,
    due_date TEXT NOT NULL,
    total_cents INTEGER NOT NULL CHECK (typeof(total_cents) = 'integer' AND total_cents >= 0)
);
CREATE TABLE payments (
    payment_id INTEGER PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(invoice_id),
    amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0)
);
INSERT INTO invoices VALUES
    (1, 'Aspen Cleaning', '2026-10-20', 20000),
    (2, 'Cedar Repairs', '2026-10-25', 15000),
    (3, 'Frost Studio', '2026-11-10', 10000);
INSERT INTO payments VALUES (1, 1, 5000), (2, 1, 2500), (3, 2, 15000);
COMMIT;

-- A CTE is a named query used by the SELECT that immediately follows it.
-- Aggregate payments FIRST: joining raw payments can duplicate invoice totals.
WITH paid AS (
    SELECT invoice_id, SUM(amount_cents) AS paid_cents
    FROM payments GROUP BY invoice_id
)
SELECT i.invoice_id, i.customer, i.due_date,
       i.total_cents - COALESCE(p.paid_cents, 0) AS balance_cents
FROM invoices AS i
LEFT JOIN paid AS p ON p.invoice_id = i.invoice_id
-- EDIT HERE: fixed comparison date makes the lesson repeatable.
-- Due before this date means overdue; due on this date is not yet overdue here.
WHERE i.due_date < '2026-10-29'
  AND i.total_cents - COALESCE(p.paid_cents, 0) > 0
ORDER BY i.due_date, i.invoice_id;
-- Expected: invoice 1, Aspen Cleaning, balance_cents 12500.
-- Overpayments, refunds, voids and currency conversions are outside this teaching schema.
