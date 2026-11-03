"""List due follow-ups; this tool does not contact anyone."""
from datetime import date
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


def due_followups(path, as_of):
    due = []
    for number, row in read_rows(path, ("business", "next_followup", "status")):
        if not row["business"] or len(row["business"]) > 120:
            raise ValueError(f"Record near line {number}: business needs 1 to 120 characters.")
        if row["status"] not in {"open", "closed"}:
            raise ValueError(f"Record near line {number}: status must be open or closed.")
        try:
            next_date = date.fromisoformat(row["next_followup"])
        except ValueError as error:
            raise ValueError(f"Record near line {number}: invalid follow-up date.") from error
        # A closed row is still validated, but it never becomes a due task.
        if row["status"] == "open" and next_date <= as_of:
            due.append((next_date, row["business"]))
    return sorted(due)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="?", type=Path, default=Path(__file__).with_name("customers.csv"))
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today(), help="ISO date, such as 2026-10-29")
    args = parser.parse_args()
    try:
        due = due_followups(args.csv, args.as_of)
    except (OSError, ValueError, csv.Error) as error:
        print(f"Could not build follow-up queue: {error}", file=sys.stderr)
        return 1
    for next_date, business in due:
        print(f"{next_date.isoformat()} | {business}")
    print(f"Due follow-ups: {len(due)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
