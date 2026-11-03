"""Summarize a fictional expense CSV without changing the input file."""
from datetime import date
from decimal import Decimal, InvalidOperation
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


def summarize(path):
    totals = {}
    for number, row in read_rows(path, ("date", "category", "amount")):
        try:
            date.fromisoformat(row["date"])
            amount = Decimal(row["amount"])
        except (ValueError, InvalidOperation) as error:
            raise ValueError(f"Record near line {number}: invalid date or amount.") from error
        if not row["category"] or len(row["category"]) > 80:
            raise ValueError(f"Record near line {number}: category needs 1 to 80 characters.")
        # Validate before multiplying: no negative, nonfinite or huge amounts.
        if not amount.is_finite() or not Decimal("0") <= amount <= Decimal("1000000"):
            raise ValueError(f"Record near line {number}: amount must be from 0 to 1000000.")
        # Fractional cents are rejected instead of rounded without permission.
        cents = amount * 100
        if cents != cents.to_integral_value():
            raise ValueError(f"Record near line {number}: amount must be whole cents.")
        category = row["category"]
        totals[category] = totals.get(category, 0) + int(cents)
    return totals


def money(cents):
    # Decimal makes the final formatting rule independent of binary floats.
    return f"${Decimal(cents) / 100:.2f}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="?", type=Path, default=Path(__file__).with_name("expenses.csv"))
    args = parser.parse_args()
    # Complete validation before printing: a bad record cannot produce a partial report.
    try:
        totals = summarize(args.csv)
    except (OSError, ValueError, csv.Error) as error:
        print(f"Could not summarize expenses: {error}", file=sys.stderr)
        return 1
    for category in sorted(totals):
        print(f"{category}: {money(totals[category])}")
    print(f"Total: {money(sum(totals.values()))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
