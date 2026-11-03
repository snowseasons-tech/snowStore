"""Summarize fictional post metrics without logging in to a social account."""
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
            # Reject extra cells or missing cells before applying project validation rules.
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"CSV record near line {line_number} has the wrong number of cells.")
            if len(rows) >= 10000:
                raise ValueError("This learning tool accepts at most 10000 records.")
            rows.append((line_number, {key: value.strip() for key, value in row.items()}))
        return rows



def summarize(path):
    rows = []
    totals = [0, 0, 0, 0]
    for number, row in read_rows(path, ("title", "views", "likes", "comments", "saves")):
        if not row["title"] or len(row["title"]) > 120:
            raise ValueError(f"Record near line {number}: title needs 1 to 120 characters.")
        try:
            metrics = [int(row[key]) for key in ("views", "likes", "comments", "saves")]
        except ValueError as error:
            raise ValueError(f"Record near line {number}: counts must be whole numbers.") from error
        if any(value < 0 or value > 1000000000 for value in metrics):
            raise ValueError(f"Record near line {number}: counts must be from 0 to 1000000000.")
        # This is OUR teaching formula, not an official metric for any platform.
        views, likes, comments, saves = metrics
        actions = likes + comments + saves
        # None marks an undefined rate when the denominator is zero.
        rate = actions / views * 100 if views else None
        rows.append((row["title"], actions, rate))
        totals = [old + new for old, new in zip(totals, metrics)]
    return rows, totals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="?", type=Path, default=Path(__file__).with_name("posts.csv"))
    args = parser.parse_args()
    try:
        rows, totals = summarize(args.csv)
    except (OSError, ValueError, csv.Error) as error:
        print(f"Could not summarize posts: {error}", file=sys.stderr)
        return 1
    for title, actions, rate in rows:
        display = f"{rate:.2f}%" if rate is not None else "not available (zero views)"
        print(f"{title}: {actions} actions; actions/views {display}")
    views, likes, comments, saves = totals
    # Sum first, then divide. Averaging individual percentages is a different statistic.
    rate = (likes + comments + saves) / views * 100 if views else None
    print(f"Total views: {views}; total actions: {likes + comments + saves}")
    print("Combined actions/views: " + (f"{rate:.2f}%" if rate is not None else "not available"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
