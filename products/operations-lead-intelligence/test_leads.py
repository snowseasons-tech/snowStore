import csv
import io
import tempfile
import sqlite3
import unittest
from pathlib import Path

from leads import export_csv, import_csv, list_leads, update_lead, workspace


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'leads.sqlite3'

    def tearDown(self):
        self.temp.cleanup()

    def test_import_mapping_duplicates_and_persistence(self):
        source = 'Company,Email,fit,intent,budget\nExample Co,hello@example.com,90,80,70\nexample co,HELLO@example.com,1,2,3\n'
        with workspace(self.path) as db:
            result = import_csv(db, io.StringIO(source), {'name': 'Company', 'email': 'Email'})
            self.assertEqual(result, {'added': 1, 'duplicates_skipped': 1})
            update_lead(db, 1, {'stage': 'Contacted', 'notes': 'Follow up next week'})
        with workspace(self.path) as db:
            rows = list_leads(db, 'Contacted', 80)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['score'], 82)
            self.assertEqual(rows[0]['notes'], 'Follow up next week')
            self.assertEqual(list_leads(db, minimum=90), [])

    def test_invalid_import_is_atomic(self):
        for source in ('name,fit\nGood,20\nBad,101\n', 'name,stage\nGood,New\nBad,Unknown\n', 'name,fit\nGood,1\nBad,2.5\n', 'name,email\nGood,a@example.com,extra\n'):
            with workspace(self.path) as db:
                with self.assertRaises(ValueError):
                    import_csv(db, io.StringIO(source))
                self.assertEqual(list_leads(db), [])

    def test_bad_mapping_and_duplicate_headers(self):
        with workspace(self.path) as db:
            for source, mapping in [('name,name\nA,B\n', None), ('Company\nA\n', {'name': 'Missing'}), ('name\nA\n', {'unknown': 'name'})]:
                with self.assertRaises(ValueError):
                    import_csv(db, io.StringIO(source), mapping)

    def test_update_validation_and_conflict(self):
        with workspace(self.path) as db:
            import_csv(db, io.StringIO('name,email\nA,a@example.com\nB,a@example.com\n'))
            for changes in ({'fit': '-1'}, {'intent': 'NaN'}, {'stage': 'Unknown'}, {'name': ''}, {}):
                with self.assertRaises(ValueError):
                    update_lead(db, 1, changes)
            with self.assertRaises(ValueError):
                update_lead(db, 999, {'stage': 'Won'})
            self.assertEqual(list_leads(db)[0]['name'], 'A')

    def test_export_quotes_unicode_and_formula_safety(self):
        with workspace(self.path) as db:
            import_csv(db, io.StringIO('name,notes\n"Example, Café","=SUM(1,2)"\n'))
            output = io.StringIO(newline='')
            self.assertEqual(export_csv(db, output), 1)
            row = next(csv.DictReader(io.StringIO(output.getvalue())))
            self.assertEqual(row['name'], 'Example, Café')
            self.assertEqual(row['notes'], "'=SUM(1,2)")
            self.assertEqual(list_leads(db)[0]['notes'], '=SUM(1,2)')

    def test_follow_up_search_and_export(self):
        with workspace(self.path) as db:
            import_csv(db, io.StringIO('name,stage,follow_up,notes\nExample One,New,2026-11-06,Call requested\nExample Two,Won,2026-11-01,Call completed\nExample Three,New,2026-12-01,Later\nExample Four,New,,Unscheduled\n'))
            self.assertEqual([r['name'] for r in list_leads(db, search='CALL', due_by='2026-11-06')], ['Example One'])
            output = io.StringIO()
            self.assertEqual(export_csv(db, output, search='one', due_by='2026-11-06'), 1)
            self.assertIn('2026-11-06', output.getvalue())
            for value in ('2026-02-30', '20261106', 'next week'):
                with self.assertRaises(ValueError):
                    update_lead(db, 1, {'follow_up': value})
            update_lead(db, 1, {'follow_up': ''})
            self.assertEqual(list_leads(db, due_by='2026-11-06'), [])

    def test_existing_database_migration_preserves_records(self):
        with sqlite3.connect(self.path) as db:
            db.execute("CREATE TABLE leads (id INTEGER PRIMARY KEY, name TEXT, email TEXT, website TEXT, phone TEXT, stage TEXT, fit INTEGER, intent INTEGER, budget INTEGER, notes TEXT, updated_at TEXT)")
            db.execute("INSERT INTO leads VALUES (1,'Existing','a@example.com','','','New',80,70,60,'Keep me','2026-01-01')")
        for _ in range(2):
            with workspace(self.path) as db:
                row = list_leads(db)[0]
                self.assertEqual(row['notes'], 'Keep me')
                self.assertEqual(row['follow_up'], '')
                update_lead(db, 1, {'follow_up': ''})


if __name__ == '__main__':
    unittest.main()
