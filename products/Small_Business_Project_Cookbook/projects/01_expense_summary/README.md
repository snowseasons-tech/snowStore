# Recipe 01 Expense summary

**Outcome:** Read a CSV of expenses and total each category without editing the source.

**Languages:** Python. **Time:** 45–60 minutes.

**Files:** [projects/01_expense_summary](projects/01_expense_summary/).

### Ingredients

Python 3.11 or later. The standard library supplies csv, decimal and argparse; no pip installation is needed. Files: report.py and expenses.csv.

### Method

1. Inspect expenses.csv. It has date, category and amount headings with four fictional records.
2. From the cookbook root run `python3 projects/01_expense_summary/report.py`. On Windows use `py -3` instead of `python3` in all Python commands.
3. Read the inline comments, then find summarize and money. Note where text becomes a Decimal and then whole cents.
4. To use a separate practice file, run `python3 projects/01_expense_summary/report.py "PATH_TO_CSV"`, replacing the placeholder with your file path. Quotes preserve spaces.

### Expected result

Software: $29.00; Supplies: $60.00; Travel: $18.25; Total: $107.25. Category lines are sorted alphabetically.

### Make it your own

Add a $10.00 Travel record using a valid date. Predict the new category and overall totals, then run. Answer: Travel $28.25 and total $117.25. In a copy, try amount hello or 1.001 and confirm a readable failure with no partial report.

### Error handling and limits

Requires exact, unique CSV headings. Missing files, malformed rows, invalid dates, nonfinite amounts and fractional cents are rejected. Negative amounts are deliberately unsupported; refunds require a separate policy. Category matching is case-sensitive. This is a summary tool, not a tax or accounting ledger.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.
