# SaaS Financial Projection Engine

A 5-year (60-month) financial model for SaaS and subscription start-ups, built as a single Excel workbook with live formulas.

Try the [interactive revenue model demo](demo.html) first. It runs the workbook's customer and MRR formulas in your browser on the same sample assumptions.

## File
- `SaaS_Financial_Engine.xlsx`

## What's inside
| Sheet | Purpose |
|---|---|
| README | Quick-start, colour legend, model notes |
| Investor Dashboard | KPI tiles and six charts (ARR, revenue vs EBITDA, MRR, cash, customers, ownership) |
| Assumptions | Every input. Pick Base / Upside / Downside with the yellow selector |
| Monthly | 60-month engine: customers, MRR/ARR, COGS, headcount, payroll, opex, EBITDA, cash |
| Annual | 5-year summary |
| Unit Economics | Fully loaded CAC, LTV, LTV:CAC, CAC payback, sales efficiency, Rule of 40 |
| Cohorts | 12 monthly cohorts x 24 months, retention curve and cohort MRR |
| Headcount | Hiring plan by department and salaries |
| Cap Table | Seed / Series A / Series B rounds, dilution, ARR-multiple valuation calculator |
| Scenarios | Scenario comparison and two sensitivity matrices (ARR; LTV:CAC) |

## How to use
1. Open the workbook in Excel, Google Sheets (File > Import) or LibreOffice.
2. On **Assumptions**, choose a scenario and overwrite the blue cells.
3. Update the hiring plan on **Headcount** and funding rounds on **Cap Table**.
4. Read results on **Investor Dashboard**.

## Notes
- All shipped numbers are illustrative samples.
- Taxes, capex and working capital are not modelled; EBITDA stands in for operating cash flow.
- Churn is a flat monthly rate. The Scenarios sheet has a check cell that should read 0.
- Uses only standard functions (INDEX, MATCH, SUMIF, ROUNDUP), so it works in Excel, Google Sheets and LibreOffice.
- Planning template only; not financial, tax or legal advice.
