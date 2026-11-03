-- RUN ONCE in a fresh jobs database: .read paid_pack/setup.sql
-- The paid pack has its own setup. Do not run the free setup in this database.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
-- CREATE TABLE defines the column names and the rules for stored values.
-- No IF NOT EXISTS: a mistaken second setup run should fail visibly.
CREATE TABLE customers (
    -- INTEGER PRIMARY KEY uniquely identifies each customer row.
    customer_id INTEGER PRIMARY KEY,
    -- NOT NULL requires a value; CHECK also rejects blank business names.
    business_name TEXT NOT NULL CHECK (length(trim(business_name)) > 0),
    city TEXT NOT NULL CHECK (length(trim(city)) > 0),
    -- NULL means missing or unknown, not an empty string or zero.
    email TEXT
);
-- Fictional customers. Single quotes hold SQL text; commas separate values.
INSERT INTO customers (customer_id, business_name, city, email) VALUES
    (1, 'Aspen Cleaning', 'Longmont', 'hello@aspen.example'),
    (2, 'Cedar Repairs', 'Boulder', NULL),
    (3, 'Frost Studio', 'Longmont', 'hello@frost.example'),
    (4, 'Pine Office', 'Loveland', 'hello@pine.example');

-- Each job belongs to one existing customer.
CREATE TABLE jobs (
    job_id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
    -- CHECK limits status to the three supported values.
    status TEXT NOT NULL CHECK (status IN ('quoted', 'completed', 'cancelled')),
    -- Store whole cents, so $150.00 is 15000, not 150.00.
    -- typeof guards SQLite's flexible typing; fractional cents are rejected.
    amount_cents INTEGER NOT NULL
        CHECK (typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 0 AND 100000000),
    -- Dates are ISO-formatted text in this teaching dataset.
    -- TEXT alone does not validate calendar dates.
    job_date TEXT NOT NULL
);

INSERT INTO jobs (job_id, customer_id, status, amount_cents, job_date) VALUES
    (101, 1, 'completed', 15000, '2026-10-01'),
    (102, 1, 'quoted', 8000, '2026-10-03'),
    (103, 2, 'completed', 22500, '2026-10-04'),
    (104, 3, 'cancelled', 10000, '2026-10-05'),
    (105, 3, 'completed', 12500, '2026-10-06');
COMMIT;
