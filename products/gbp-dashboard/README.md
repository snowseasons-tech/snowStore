# Google Business Profile Performance Dashboard

A single-file dashboard for the numbers in your Google Business Profile: profile views by platform and device, searches, calls, website clicks, direction requests, messages and bookings, each compared with the previous period. Import the CSV you download from Google and it charts the numbers. No account, server, API key or build step is needed, and nothing leaves your browser.

It opens with fictional sample data (three café locations, 12 months), so you can look around before importing anything.

## Files
- `index.html`: the whole dashboard. Open it in any modern browser.

## What's on the page
| Section | What it shows |
|---|---|
| Key numbers | Profile views, Searches, Interactions, Calls, Website clicks, Directions, Messages and Bookings, each with its change against the previous period |
| Profile views over time | Stacked bars for Google Search and Google Maps on mobile and desktop. The bars are daily, weekly or monthly depending on the length of the range. Click **Table** to see the numbers. |
| Where people viewed your profile | Share of views by platform and device, plus the Search/Maps and mobile split |
| Interactions over time | Stacked calls, website clicks, directions, messages and bookings, with a table view |
| Interactions by type | Totals with change vs the previous period, and the share of views that led to an interaction |
| Locations | One row per profile with all the metrics, the change in views and the interaction rate. Click a row to filter the whole dashboard to that location. |
| Top search terms | What people searched to find you (from a search terms CSV) |
| Your data | Every file you've imported, plus **Load sample data** and **Clear all data** |

**Filters:** location, and a date range of last 7, 28 or 90 days, last 6 or 12 months, latest full month, all data, or a custom range. Ranges count back from the latest date in your data, not from today, because Google's numbers arrive a few days late. A range of whole calendar months is compared with the same number of months before it; any other range is compared with the same number of days before it. If the earlier period has too little data, the dashboard says so instead of showing a misleading percentage.

**Export CSV** downloads the daily numbers for the current filters, in a format the dashboard can import again (useful as a backup, or to move to another computer). **Export summary** downloads the Locations table.

## Getting your numbers from Google
1. Sign in to Business Profile Manager at business.google.com/locations.
2. Tick the profile or profiles you want, choose **Download**, then the insights/performance report. Google moves this menu around from time to time, so look for "Download" near the list of profiles.
3. Pick the date range (Google allows up to about 90 days per file) and download the CSV.
4. In the dashboard, click **Import CSV** and choose the file. Google's file has one row of totals per location and no dates, so the dashboard asks which dates it covers. Enter the range you picked in step 3. If the file name contains two dates (for example `insights_2026-09-01_2026-09-30.csv`), they are filled in for you.

Import one file per month to build up history: September, then August, and so on. Importing a file for the same location and dates again replaces the old numbers, so nothing is counted twice. You can select several files at once.

### Other files it reads
- **Daily data:** any CSV with a `Date` column (plus an optional `Location` column) is read row by row. That includes data pulled from the Business Profile Performance API, whose metric names (`BUSINESS_IMPRESSIONS_MOBILE_SEARCH`, `CALL_CLICKS`, `WEBSITE_CLICKS` and so on) are recognised, and exports from most reporting tools. Dates can be `2026-09-30`, `09/30/2026`, `Sep 30, 2026`, or a month such as `2026-09` or `Sep 2026`.
- **Search terms:** a CSV with a `Search term` (or `Keyword`) column and a count column fills the Top search terms table. Google shows low counts as `<15`, and the table keeps that.
- Comma, tab and semicolon separated files all work, in UTF-8 or UTF-16.

Columns are matched by name, so their order doesn't matter, and columns the dashboard doesn't use (rating, labels, food orders, hotel bookings) are ignored. If a metric isn't in any file you imported, its tile says "Not in your export" instead of showing zero. Google's bulk export usually has no Searches column, for example.

## Good to know
- **Totals are spread over their days.** A file with one total for September is stored as 1/30 of it per day. Totals for the whole month match Google's file exactly. A range that cuts a month in half gets a proportional share, and the charts say when this applies. Import daily data if you need exact daily numbers.
- **Where the data lives.** Imported data is saved in this browser's storage for this file, so it's still there next time you open the dashboard on the same computer and browser. It isn't uploaded anywhere. Private windows and clearing site data remove it, so use **Export CSV** to keep a copy.
- **Internet connection needed** for Tailwind CSS and Chart.js, which load from public CDNs.
- Works on phones: the filters stack, the tiles go two across, the tables scroll sideways inside their cards, and the date dialog opens as a bottom sheet.

## Customization
- **Business name:** change "Your Business" in the `<header>` and the `<title>`.
- **Colors:** chart colors are the `color` values in `METRICS` near the top of the script. They were picked to stay distinguishable for color-blind viewers, so change them with care.
- **Which numbers get a tile:** edit the `KPIS` list. `idx` lists the metrics to add together.
- **Comparison rule:** `COVERED` (0.9) is the share of a period's days that need data before a change % is shown.
- **Sample data:** `loadSample()` generates it. Edit the `sites` list and the `state.terms` list there.

## Tech
One HTML file using Tailwind CSS 3.4 and Chart.js 4.4 from CDNs, with plain JavaScript and no build tooling or dependencies.

## Notes
- The sample locations, numbers and search terms are fictional.
- Not affiliated with or endorsed by Google. Google Business Profile is a trademark of Google LLC.
