"""List drafts planned on or before a chosen date; nothing is published."""
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
            # Reject extra cells or missing cells before applying title rules.
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"CSV record near line {line_number} has the wrong number of cells.")
            if len(rows) >= 10000:
                raise ValueError("This learning tool accepts at most 10000 records.")
            rows.append((line_number, {key: value.strip() for key, value in row.items()}))
        return rows


def due_drafts(path, as_of):
    due = []
    for number, row in read_rows(path, ("title", "publish_on", "status")):
        if not row["title"] or len(row["title"]) > 120:
            raise ValueError(f"Record near line {number}: title needs 1 to 120 characters.")
        if row["status"] not in {"draft", "published"}:
            raise ValueError(f"Record near line {number}: status must be draft or published.")
        try:
            publish_date = date.fromisoformat(row["publish_on"])
        except ValueError as error:
            raise ValueError(f"Record near line {number}: invalid draft date.") from error
        # A published row is still validated, but it never becomes a ready draft.
        if row["status"] == "draft" and publish_date <= as_of:
            due.append((publish_date, row["title"]))
    return sorted(due)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="?", type=Path, default=Path(__file__).with_name("drafts.csv"))
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today(), help="ISO date, such as 2026-10-29")
    args = parser.parse_args()
    try:
        due = due_drafts(args.csv, args.as_of)
    except (OSError, ValueError, csv.Error) as error:
        print(f"Could not build draft queue: {error}", file=sys.stderr)
        return 1
    for publish_date, title in due:
        print(f"{publish_date.isoformat()} | {title}")
    print(f"Drafts to review: {len(due)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
