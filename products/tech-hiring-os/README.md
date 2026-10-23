# Tech Hiring & Compensation Benchmark OS 2026

A hiring operating system for tech start-ups: structured role scorecards, a behavioural interview bank, global compensation bands, an offer letter generator and a 30-60-90 day onboarding plan. The three files are designed to work together.

## Files
- `Hiring_OS_2026.xlsx` - the workbook (14 sheets, live formulas)
- `Interview_Question_Bank.pdf` - 27-page interviewer guide (142 questions, 27 competencies)
- `Offer_Templates.docx` - offer letter kit (4 letter templates, approval form, call script, 6 emails)

## What's inside the workbook
| Sheet | Purpose |
|---|---|
| README | Quick start, colour legend, how the numbers work |
| Dashboard | Req and offer KPIs, budget by department, offer funnel, two charts |
| Hiring Plan | Requisitions auto-priced from the band midpoint, loaded cost, plan-year proration |
| Band Calculator | One offer checked end to end: band, compa-ratio, range penetration, OTE, equity guideline, year-1 total comp |
| Comp Bands | Min / mid / max for every role and level, re-priced for any of 21 locations |
| Salary Benchmarks | Market P25 / P50 / P75 for 15 roles x L1-L5 (Engineering, Product, Sales) |
| Scorecard - Engineering / Product / Sales | Mission, 12-month outcomes, must-haves, weighted competencies, 4-interviewer scoring, automatic hire recommendation |
| Interview Loops | Stage-by-stage loops with question-bank IDs and pass bars, plus process SLAs |
| Offer Generator | Offer inputs, approval flags, `{{merge fields}}` and an auto-written letter preview |
| Offer Tracker | Offer log with band status, expiry and days to decision |
| Onboarding 30-60-90 | 47 role-aware tasks; due dates and phase progress update from the start date |
| Settings | Company stage, positioning, band spread, share price, locations / FX / employer cost, dropdown lists |

## How to use
1. **Settings**: company name, stage, positioning, price per share, FX.
2. **Salary Benchmarks**: replace the illustrative data with your survey cut (blue cells).
3. **Scorecards** and **Interview Loops**: set the bar before interviewing. Interviewers use the question IDs in the PDF.
4. **Offer Generator**: fill the inputs, check the approval route, then paste the merge-field values into `Offer_Templates.docx` (Find & Replace or Word Mail Merge).
5. Log the offer in **Offer Tracker**, then run **Onboarding 30-60-90**.

## Notes
- Market data, geo multipliers, FX rates and employer-cost loads are illustrative 2026 planning estimates, not survey results.
- All names, requisitions and offers are fictional samples.
- Uses standard functions only (INDEX, MATCH, SUMIFS, COUNTIFS, TEXT), so it works in Excel, Google Sheets and LibreOffice.
- Process and drafting templates only; not legal, tax or financial advice. Have counsel review offer letters for each jurisdiction.
