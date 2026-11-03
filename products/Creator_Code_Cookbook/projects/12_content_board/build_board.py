"""Validate a fictional content plan and build a SQLite snapshot plus HTML board."""
from datetime import date
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
            # Reject extra cells or missing cells before applying project validation rules.
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"CSV record near line {line_number} has the wrong number of cells.")
            if len(rows) >= 10000:
                raise ValueError("This learning tool accepts at most 10000 records.")
            rows.append((line_number, {key: value.strip() for key, value in row.items()}))
        return rows



def validate_content(path):
    records = []
    seen = set()
    for number, row in read_rows(path, ("post_id", "title", "format", "planned_date", "status")):
        if not row["post_id"] or len(row["post_id"]) > 40 or row["post_id"] in seen:
            raise ValueError(f"Record near line {number}: missing, duplicate or overlong post id.")
        if not row["title"] or len(row["title"]) > 120:
            raise ValueError(f"Record near line {number}: title needs 1 to 120 characters.")
        if row["format"] not in {"video", "photo", "carousel"}:
            raise ValueError(f"Record near line {number}: format must be video, photo or carousel.")
        if row["status"] not in {"idea", "draft", "ready", "published"}:
            raise ValueError(f"Record near line {number}: invalid status.")
        try:
            planned = date.fromisoformat(row["planned_date"]).isoformat()
        except ValueError as error:
            raise ValueError(f"Record near line {number}: invalid planned date.") from error
        seen.add(row["post_id"])
        records.append((row["post_id"], row["title"], row["format"], planned, row["status"]))
    return records


def create_database(path, records):
    connection = sqlite3.connect(path)
    try:
        with connection:
            connection.execute("""CREATE TABLE content (
                post_id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                format TEXT NOT NULL CHECK(format IN ('video','photo','carousel')),
                planned_date TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('idea','draft','ready','published'))
            )""")
            # Parameters keep data separate from executable SQL text.
            connection.executemany("INSERT INTO content VALUES (?, ?, ?, ?, ?)", records)
        return connection.execute("SELECT * FROM content ORDER BY planned_date, post_id").fetchall()
    finally:
        connection.close()


def render_board(rows):
    # Escape every CSV value; a title containing <script> must remain visible text.
    table = "\n".join("<tr>" + "".join("<td>" + escape(value) + "</td>" for value in row) + "</tr>" for row in rows)
    template = Path(__file__).with_name("board_template.html").read_text(encoding="utf-8")
    return template.replace("<!-- CONTENT_ROWS -->", table)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="?", type=Path, default=Path(__file__).with_name("content.csv"))
    parser.add_argument("--output-parent", type=Path, default=Path(__file__).resolve().parent,
                        help="Existing writable directory for a fresh output folder")
    args = parser.parse_args()
    try:
        # Reject bad input before creating the snapshot folder.
        records = validate_content(args.csv)
        folder = Path(tempfile.mkdtemp(prefix="content-board-", dir=args.output_parent))
        rows = create_database(folder / "content.db", records)
        with (folder / "index.html").open("x", encoding="utf-8") as output:
            output.write(render_board(rows))
    except (OSError, ValueError, csv.Error, sqlite3.Error) as error:
        print(f"Could not build content board: {error}. A partial output folder may remain.", file=sys.stderr)
        return 1
    print(f"Board: {folder / 'index.html'}")
    print(f"Database: {folder / 'content.db'}")
    print(f"Posts: {len(rows)}; ready: {sum(row[-1] == 'ready' for row in rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
