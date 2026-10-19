# Snow Seasons — Store Inventory Tracker

A single-file inventory tracker for small sellers. Open `inventory_tracker_application.html` in a browser and start adding products. There is no account, server, or install, and your data stays on your own device.

Built by Snow Seasons Tech ([snowseasonstech.store](https://snowseasonstech.store)).

## Quick start

1. Open `inventory_tracker_application.html` in any modern browser (Chrome, Edge, Firefox, Safari).
2. Click **Add Product**, or **Load Demo Data** to see it with sample items.
3. Your inventory saves automatically as you work.

It works fully offline. Styling (compiled Tailwind CSS), icons, and the Inter font are all embedded in the file, so it makes no network requests.

## Features

- **Dashboard stats**: total SKUs, total units, total cost value, retail value, low-stock count, out-of-stock count, and top category
- **Product management**: add, edit, duplicate, and delete products
- **Quick quantity edit**: change stock directly in the table without opening the editor
- **Stock status badges**: In Stock, Low Stock (per-item threshold), and Out of Stock
- **Search, filter, and sort**: search by name or SKU, filter by category and stock status, and sort by column
- **CSV import and export**: bring in an existing spreadsheet or back up your inventory
- **CSV template download**: a ready-made file with the correct columns
- **Light/dark theme toggle**
- **Responsive layout** that works on phones and tablets

## Product fields

| Field | Required | Notes |
|-------|----------|-------|
| SKU Code | Yes | Your own identifier, e.g. `ELEC-10` |
| Product Name | Yes | |
| Category | Yes | Existing categories are suggested as you type |
| Stock Qty | Yes | Whole number, 0 or more |
| Cost Price ($) | No | What you pay per unit |
| Selling Price ($) | No | What you sell it for |
| Low Stock Alert Threshold | Yes | Default 5. Status becomes **Low Stock** when quantity is at or below this number |

## CSV import

Click **Import CSV** and choose a `.csv` file. Use **the template button** (download icon) to get a correctly formatted starting file. Columns, in order:

```
SKU, Product Name, Category, Quantity in Stock, Cost Price, Selling Price, Low Stock Threshold
```

**Export CSV** produces the same format, so you can edit in a spreadsheet and re-import.

## Where your data lives

Data is stored in your browser's `localStorage` under the key `store_inventory_data_v1`. Nothing is sent to a server.

- It stays in that browser on that device. Opening the file in a different browser or on another computer starts with an empty inventory.
- Clearing site data or browsing history can erase it.
- **Export to CSV regularly** to keep a backup. The red reset button clears all local data.

## Customizing

Everything is in the one HTML file. Styling is compiled Tailwind CSS embedded in a `<style>` block near the top, so changing utility classes in the markup only works for classes already present in that CSS. To restyle freely, edit the CSS directly. The demo items live in the `sampleProducts` array in the script. Edit these to rebrand or change the starter data.

## License and support

Licensed for use by the purchaser. For help, visit [snowseasonstech.store](https://snowseasonstech.store).
