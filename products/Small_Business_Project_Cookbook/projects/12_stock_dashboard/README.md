# Recipe 12 Searchable stock dashboard

**Outcome:** Validate inventory CSV, create a SQLite snapshot and generate a self-contained searchable HTML report.

**Languages:** Python, SQL, HTML, CSS and JavaScript. **Time:** 2–3 hours.

**Files:** [projects/12_stock_dashboard](projects/12_stock_dashboard/).

### Ingredients

Python 3.11 or later with sqlite3 and a browser. Files: stock.csv, build_dashboard.py and dashboard_template.html. No pip packages, web server or API is needed.

### Method

1. Inspect stock.csv, including whole-item quantities, reorder thresholds and dollar unit prices.
2. From the cookbook root run `python3 projects/12_stock_dashboard/build_dashboard.py`.
3. Copy the printed report path and open that index.html in your browser. Search for Reorder, then Gloves, then clear the field.
4. Read validate_stock, create_database and render_dashboard. Values enter SQL through bound parameters and enter HTML through escaping. To place fresh report folders elsewhere, use `--output-parent "EXISTING_WRITABLE_FOLDER"`.

### Expected result

A fresh stock-report-* directory containing stock.db and index.html. Four items, two requiring reorder. Paper towels and Glass cleaner have quantities at or below their thresholds. Filtering Reorder shows those two rows; Gloves shows one.

### Make it your own

Set Gloves quantity to 3 in a practice CSV and rebuild. Answer: three reorder items appear in the new snapshot. Add a duplicate SKU or fractional-cent price and confirm it fails. Put `<em>Sample</em>` in a name and confirm it displays literally rather than becoming HTML.

### Error handling and limits

This is an immutable snapshot: browser filtering changes visibility only. Inventory edits require changing source data and rebuilding. Every run creates new output rather than overwriting earlier reports. A filesystem failure may leave a partial output folder. The page is self-contained but not an authenticated inventory application.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.
