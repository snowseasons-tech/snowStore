import csv
import io
import tempfile
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


if __name__ == '__main__':
    unittest.main()
