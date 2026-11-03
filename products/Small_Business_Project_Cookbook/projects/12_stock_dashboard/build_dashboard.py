"""Validate a stock CSV and create a new SQLite database plus local HTML report."""
from decimal import Decimal, InvalidOperation
from html import escape
import sqlite3
import tempfile
from pathlib import Path
import argparse
import csv
import sys


def read_rows(path, required):
    """Read bounded, consistently shaped CSV rows or report a useful error."""
    # utf-8-sig also accepts CSV files with an optional UTF-8 byte-order mark.
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source, strict=True)
        fields = reader.fieldnames
        if not fields or len(fields) != len(set(fields)) or set(fields) != set(required):
            raise ValueError("CSV headings must be exactly: " + ", ".join(required))
        rows = []
        for line_number, row in enumerate(reader, 2):
            # Reject extra cells or missing cells before applying business rules.
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"CSV record near line {line_number} has the wrong number of cells.")
            if len(rows) >= 10000:
                raise ValueError("This learning tool accepts at most 10000 records.")
            rows.append((line_number, {key: value.strip() for key, value in row.items()}))
        return rows


def validate_stock(path):
    records = []
    seen = set()
    for number, row in read_rows(path, ("sku", "name", "quantity", "reorder_at", "unit_price")):
        if not row["sku"] or len(row["sku"]) > 40 or row["sku"] in seen:
            raise ValueError(f"Record near line {number}: SKU is missing, too long or duplicated.")
        if not row["name"] or len(row["name"]) > 120:
            raise ValueError(f"Record near line {number}: name needs 1 to 120 characters.")
        try:
            quantity = int(row["quantity"])
            reorder = int(row["reorder_at"])
            price = Decimal(row["unit_price"])
        except (ValueError, InvalidOperation) as error:
            raise ValueError(f"Record near line {number}: invalid quantity, threshold or price.") from error
        if not 0 <= quantity <= 1000000 or not 0 <= reorder <= 1000000:
            raise ValueError(f"Record near line {number}: quantities must be from 0 to 1000000.")
        if not price.is_finite() or not Decimal("0") <= price <= Decimal("1000000"):
            raise ValueError(f"Record near line {number}: invalid price range.")
        cents = price * 100
        if cents != cents.to_integral_value():
            raise ValueError(f"Record near line {number}: price needs whole cents.")
        seen.add(row["sku"])
        records.append((row["sku"], row["name"], quantity, reorder, int(cents)))
    return records


def create_database(path, records):
    connection = sqlite3.connect(path)
    try:
        # The context manager commits on success and rolls back on an exception.
        with connection:
            connection.execute("""CREATE TABLE stock (
                sku TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK(quantity >= 0),
                reorder_at INTEGER NOT NULL CHECK(reorder_at >= 0),
                unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0)
            )""")
            # Bound parameters keep CSV values separate from SQL syntax.
            connection.executemany("INSERT INTO stock VALUES (?, ?, ?, ?, ?)", records)
        return connection.execute("""SELECT sku, name, quantity, reorder_at,
            unit_price_cents, quantity <= reorder_at AS needs_reorder
            FROM stock ORDER BY sku""").fetchall()
    finally:
        # The transaction context does not itself close the connection.
        connection.close()


def render_dashboard(rows):
    fragments = []
    for sku, name, quantity, threshold, cents, needs_reorder in rows:
        status = "Reorder" if needs_reorder else "Stock OK"
        # Escape ALL text before inserting it into HTML. CSV content is not markup.
        values = (sku, name, str(quantity), str(threshold),
                  f"${Decimal(cents) / 100:.2f}", status)
        fragments.append("<tr>" + "".join("<td>" + escape(value) + "</td>" for value in values) + "</tr>")
    template = Path(__file__).with_name("dashboard_template.html").read_text(encoding="utf-8")
    return template.replace("<!-- STOCK_ROWS -->", "\n".join(fragments))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="?", type=Path, default=Path(__file__).with_name("stock.csv"))
    parser.add_argument("--output-parent", type=Path, default=Path(__file__).resolve().parent,
                        help="Existing writable directory for a fresh output folder")
    args = parser.parse_args()
    try:
        # Validate the complete source before creating any report output.
        records = validate_stock(args.csv)
        folder = Path(tempfile.mkdtemp(prefix="stock-report-", dir=args.output_parent))
        rows = create_database(folder / "stock.db", records)
        page = render_dashboard(rows)
        # Exclusive creation refuses to overwrite an existing report file.
        with (folder / "index.html").open("x", encoding="utf-8") as target:
            target.write(page)
    except (OSError, ValueError, csv.Error, sqlite3.Error) as error:
        print(f"Could not build stock dashboard: {error}. A partial output folder may remain.", file=sys.stderr)
        return 1
    print(f"Report: {folder / 'index.html'}")
    print(f"Database: {folder / 'stock.db'}")
    print(f"Items: {len(rows)}; reorder: {sum(row[-1] for row in rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
