"""Local lead workspace. Python 3.11+, standard library only."""
import argparse
import csv
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

STAGES = ('New', 'Qualified', 'Contacted', 'Won', 'Lost')
FIELDS = ('name', 'email', 'website', 'phone', 'stage', 'fit', 'intent', 'budget', 'notes')


@contextmanager
def workspace(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    try:
        db.execute('''CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
            website TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
            stage TEXT NOT NULL DEFAULT 'New', fit INTEGER NOT NULL DEFAULT 0,
            intent INTEGER NOT NULL DEFAULT 0, budget INTEGER NOT NULL DEFAULT 0,
            notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name COLLATE NOCASE, email COLLATE NOCASE))''')
        with db:
            yield db
    finally:
        db.close()


def signal(value):
    value = str(value).strip()
    if not value.isascii() or not value.isdigit() or not 0 <= int(value) <= 100:
        raise ValueError('signals must be whole numbers from 0 to 100')
    return int(value)


def normalize(row):
    result = {field: str(row.get(field) or '').strip() for field in FIELDS}
    if not result['name']:
        raise ValueError('name is required')
    if result['stage'] == '':
        result['stage'] = 'New'
    if result['stage'] not in STAGES:
        raise ValueError('unknown stage: ' + result['stage'])
    for field in ('fit', 'intent', 'budget'):
        result[field] = signal(result[field] or '0')
    return result


def import_csv(db, source, mapping=None):
    """Validate the complete CSV before writing; existing records are preserved."""
    reader = csv.DictReader(source)
    mapping = mapping or {}
    headers = reader.fieldnames or []
    if len(headers) != len(set(headers)):
        raise ValueError('CSV contains duplicate column names')
    if any(field not in FIELDS for field in mapping):
        raise ValueError('mapping keys must be supported lead fields')
    if any(column not in headers for column in mapping.values()):
        raise ValueError('mapped CSV column is missing')
    if mapping.get('name', 'name') not in headers:
        raise ValueError('CSV requires a name column or a name mapping')
    rows = []
    for number, row in enumerate(reader, 2):
        if None in row:
            raise ValueError(f'row {number}: too many columns')
        try:
            rows.append(normalize({field: row.get(mapping.get(field, field), '') for field in FIELDS}))
        except ValueError as error:
            raise ValueError(f'row {number}: {error}') from error
    added = 0
    with db:
        for row in rows:
            cursor = db.execute('INSERT INTO leads (' + ','.join(FIELDS) + ') VALUES (' + ','.join('?' for _ in FIELDS) + ') ON CONFLICT(name,email) DO NOTHING', [row[field] for field in FIELDS])
            added += cursor.rowcount
    return {'added': added, 'duplicates_skipped': len(rows) - added}


def list_leads(db, stage=None, minimum=0):
    rows = []
    for record in db.execute('SELECT * FROM leads ORDER BY id'):
        lead = dict(record)
        # Integer arithmetic gives conventional half-up rounding.
        lead['score'] = (lead['fit'] * 40 + lead['intent'] * 35 + lead['budget'] * 25 + 50) // 100
        if (stage is None or lead['stage'] == stage) and lead['score'] >= minimum:
            rows.append(lead)
    return sorted(rows, key=lambda row: (-row['score'], row['id']))


def create_lead(db, values):
    if not isinstance(values, dict) or any(key not in FIELDS for key in values):
        raise ValueError('Invalid lead fields.')
    row = normalize(values)
    with db:
        cursor = db.execute('INSERT INTO leads (' + ','.join(FIELDS) + ') VALUES (' + ','.join('?' for _ in FIELDS) + ')', [row[field] for field in FIELDS])
    return cursor.lastrowid


def update_lead(db, lead_id, changes):
    existing = db.execute('SELECT * FROM leads WHERE id=?', (lead_id,)).fetchone()
    if existing is None:
        raise ValueError('lead not found')
    if not changes or any(key not in FIELDS for key in changes):
        raise ValueError('provide at least one supported field')
    row = normalize({**dict(existing), **changes})
    with db:
        db.execute('UPDATE leads SET ' + ','.join(field + '=?' for field in FIELDS) + ', updated_at=CURRENT_TIMESTAMP WHERE id=?', [row[field] for field in FIELDS] + [lead_id])


def export_csv(db, target, stage=None, minimum=0):
    fields = ('id',) + FIELDS + ('score', 'updated_at')
    writer = csv.DictWriter(target, fieldnames=fields)
    writer.writeheader()
    rows = list_leads(db, stage, minimum)
    for row in rows:
        # Spreadsheet-safe output; source records remain unchanged.
        writer.writerow({key: "'" + value if isinstance(value, str) and value.lstrip().startswith(('=', '+', '-', '@')) else value for key, value in row.items()})
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default='leads.sqlite3')
    commands = parser.add_subparsers(dest='command', required=True)
    load = commands.add_parser('import')
    load.add_argument('csv', type=Path)
    load.add_argument('--mapping', type=Path, help='JSON mapping of lead field to CSV header')
    listing = commands.add_parser('list')
    exporting = commands.add_parser('export')
    exporting.add_argument('csv', type=Path)
    for command in (listing, exporting):
        command.add_argument('--stage', choices=STAGES)
        command.add_argument('--minimum', type=signal, default=0)
    edit = commands.add_parser('update')
    edit.add_argument('id', type=int)
    for field in FIELDS:
        edit.add_argument('--' + field)
    args = parser.parse_args()
    try:
        with workspace(args.db) as db:
            if args.command == 'import':
                mapping = json.loads(args.mapping.read_text(encoding='utf-8')) if args.mapping else None
                if mapping is not None and (not isinstance(mapping, dict) or any(not isinstance(v, str) for v in mapping.values())):
                    raise ValueError('mapping must be a JSON object with string column names')
                with args.csv.open(encoding='utf-8-sig', newline='') as source:
                    print(json.dumps(import_csv(db, source, mapping)))
            elif args.command == 'list':
                print(json.dumps(list_leads(db, args.stage, args.minimum), indent=2))
            elif args.command == 'update':
                update_lead(db, args.id, {field: getattr(args, field) for field in FIELDS if getattr(args, field) is not None})
                print('Lead updated.')
            else:
                # Refuse to overwrite a database, input file or prior export.
                with args.csv.open('x', encoding='utf-8', newline='') as target:
                    count = export_csv(db, target, args.stage, args.minimum)
                print(f'Exported {count} leads.')
    except (ValueError, OSError, sqlite3.Error) as error:
        parser.exit(1, f'Error: {error}\n')


if __name__ == '__main__':
    main()
