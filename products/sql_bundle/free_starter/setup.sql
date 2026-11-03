-- RUN inside a new SQLite database with .read free_starter/setup.sql
-- Read SETUP.md first. This script creates tables; it does not delete old data.
-- Foreign key rules must be enabled before a transaction begins.
PRAGMA foreign_keys = ON;
-- BEGIN groups the creation and seed data into one unit of work.
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
-- COMMIT makes this completed unit of work permanent.
COMMIT;
