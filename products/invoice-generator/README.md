# Invoice Generator

A single-file invoice maker for small sellers and freelancers. Open `invoice_generator.html` in a browser, fill in the form, and print or save a professional PDF invoice. There is no account, subscription, server, or install, and your data stays on your own device.

## Quick start

1. Open `invoice_generator.html` in any modern browser (Chrome, Edge, Firefox, Safari).
2. Click **Load sample invoice** to see a finished example, or start typing in the blank invoice.
3. Fill in your business details once. They are remembered for every new invoice.
4. Click **Print / Save as PDF** when you're done.

Your invoices save automatically as you type. The file works fully offline. Styles, icons, and scripts are all embedded, and it makes no network requests.

## Features

- **Live preview**: the form sits on the left and the finished invoice on the right. The preview is exactly what prints. On phones the preview appears below the form.
- **Your business details and logo**: entered once and remembered for new invoices
- **Client details**: name, company, address, and email
- **Invoice numbers that count up**: **New invoice** picks the next number after your last one (`INV-0041` → `INV-0042`), keeping your prefix and zero padding. You get a warning if a number is already used.
- **Payment terms**: Due on receipt, Net 7, Net 15, Net 30, or a custom due date. The due date is calculated for you.
- **Line items**: description (multi-line), quantity, unit price, and line total. You can add, remove, and move items up or down.
- **Totals**: subtotal, optional discount (% or fixed amount), optional tax rate with your own tax name (Tax, VAT, GST…), optional shipping, total, amount already paid, and balance due
- **Exact money math**: amounts are calculated in whole cents, so you never see rounding glitches like `$8.049999`
- **10 currencies**: USD, EUR, GBP, CAD, AUD, NZD, CHF, SGD, INR, and ZAR, formatted for your browser's language
- **Status**: Draft, Sent, or Paid. Paid invoices get a **PAID** stamp, and sent invoices past their due date show as **Overdue** in your list.
- **My invoices**: every invoice is saved. Open, duplicate, or delete any of them.
- **Backup**: export everything to a JSON file and import it again on another browser or computer
- **CSV export** of your invoice list (number, client, dates, total, paid, balance, status) for your spreadsheet or bookkeeping
- **Light/dark theme toggle**. Printed invoices are always white.
- **Responsive layout** that works on phones, tablets, and desktops
- **Keyboard and screen-reader friendly**: real labels, visible focus, and good contrast in both themes

## Fields

| Section | Field | Notes |
|---------|-------|-------|
| Invoice details | Invoice number | Any text, e.g. `INV-0001` or `2026-014` |
| | Status | Draft, Sent, or Paid. Choosing **Paid** sets "Amount already paid" to the full total |
| | Issue date | Defaults to today |
| | Payment terms | Sets the due date automatically. Picking your own due date switches terms to **Custom date** |
| | Currency | Applies to this invoice. New invoices use the last currency you picked |
| From | Logo | PNG, JPG, SVG, GIF, or WebP, up to 500 KB |
| | Business name, email, phone, address | Remembered for new invoices |
| | Tax ID | Optional. Printed exactly as typed, e.g. `VAT GB123456789` or `EIN 12-3456789` |
| Bill to | Client name, company, email, address | Company is optional |
| Line items | Description | Press Enter for a second line. It prints as a smaller detail line |
| | Qty | Decimals allowed, e.g. `3.5` hours |
| | Unit price | Rounded to the cent |
| Discount, tax and payments | Discount | A percentage or a fixed amount, taken off the subtotal |
| | Tax rate % and tax name | Applied to the subtotal after the discount. Up to 3 decimals, e.g. `8.875` |
| | Shipping | Added after tax (not taxed) |
| | Amount already paid | Deposits or partial payments. Shows "Amount paid" and "Balance due" on the invoice |
| Notes and terms | Notes / payment instructions | Bank details, payment link, thank-you note |
| | Terms | Late fees, refund policy, and so on |

Your tax rate, tax name, notes, and terms are also remembered for new invoices.

## Saving as a PDF

1. Click **Print / Save as PDF**.
2. In the print dialog, set **Destination** to **Save as PDF** (Chrome and Edge), or choose **PDF** at the bottom left (Safari on Mac). On Windows you can also pick **Microsoft Print to PDF**.
3. Pick **A4** or **Letter** paper. The invoice fits either.
4. For the cleanest result, turn **off** "Headers and footers" (this removes the date and file path Chrome adds at the edges). If colors look faded, turn **on** "Background graphics".
5. Save. The file name is filled in for you, e.g. `Invoice INV-1042 - Harbor Lane Café.pdf`.

Long invoices flow onto extra pages automatically. The table header repeats on each page, and no line item is split across two pages.

## Where your data lives

Data is stored in your browser's `localStorage` under the key `snow_invoice_generator_v1` (your theme choice is under `snow_invoice_generator_theme`). Nothing is sent to a server.

- It stays in that browser on that device. Opening the file in a different browser or on another computer starts empty, so use **My invoices → Export backup (JSON)** and **Import backup** to move your invoices.
- Importing a backup **replaces** the invoices in that browser (you are asked to confirm first).
- Clearing site data or browsing history can erase your invoices. **Export a backup regularly.**
- Private or incognito windows (and some strict privacy settings) block storage. The app still works and shows a warning, but your invoices are lost when the window closes unless you export a backup.
- Browsers allow roughly 5 MB of storage, which is room for thousands of invoices. A logo is stored once, no matter how many invoices use it.

## Browser support

Works in current versions of Chrome, Edge, Firefox, and Safari on desktop, plus Chrome and Safari on phones and tablets. Saving as PDF works best in Chrome or Edge on a computer. Internet Explorer is not supported.

## Customizing

Everything is in the one HTML file. The app's colors are CSS variables at the top of the `<style>` block (`--primary` is the brand blue, with light and dark sets). The printed invoice uses its own fixed colors, in the rules starting with `.pp-`. Change `#2878b5` there to put your own brand color on your invoices. The sample invoice lives in the `sampleInvoice()` function in the script, and the currency list is the `CURRENCIES` array.

## License and support

Licensed for use by the purchaser. For help, visit [snowseasonstech.store](https://snowseasonstech.store).
