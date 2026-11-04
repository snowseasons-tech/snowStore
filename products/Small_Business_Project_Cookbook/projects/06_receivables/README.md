# Recipe 06 Overdue invoice balances

**Outcome:** Combine invoices with partial payments and list balances overdue before a fixed date.

**Languages:** SQL with SQLite. **Time:** 45–75 minutes.

**Files:** [projects/06_receivables](projects/06_receivables/).

Try the [interactive offline demo](demo.html). It uses in-memory fictional data and is not a payment processor.

### Ingredients

SQLite command line shell. File: receivables.sql. This is a small fictional teaching ledger, not a payment processor.

### Method

1. Open a fresh file from the cookbook root: `sqlite3 -bail cookbook_receivables_01.db`.
2. Enter `.bail on`, `.headers on` and `.mode column`, each on its own line.
3. Run `.read projects/06_receivables/receivables.sql` once. Read the comments explaining the paid CTE.
4. To experiment without rerunning setup, copy only the final WITH ... SELECT statement into a query file. A CTE exists for the statement immediately following it.

### Expected result

Invoice 1 for Aspen Cleaning, due 2026-10-20, with balance_cents 12500 ($125.00). Invoice 2 is fully paid. Invoice 3 is not yet overdue on 2026-10-29.

### Make it your own

In a new database, add a further 2500-cent payment for invoice 1. Answer: its balance becomes 10000 cents. Advance the comparison date to 2026-11-11 in the report only: invoice 3 also appears with 10000 cents.

### Error handling and limits

Aggregate payments before joining them to invoices. Joining raw one-to-many payments and summing invoice totals would double count some invoices. Overpayments, refunds, voids, multiple currencies and real calendar-date validation are outside this simplified schema.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.
