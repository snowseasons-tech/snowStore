import csv
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class CommandLineTests(unittest.TestCase):
    def test_follow_up_search_export_and_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = Path(__file__).with_name('leads.py')
            source = root / 'input.csv'
            source.write_text('name,notes\nExample One,Call requested\nSample Two,Later\n', encoding='utf-8')
            database = root / 'workspace.sqlite3'
            def run(*args):
                return subprocess.run([sys.executable, '-B', str(script), '--db', str(database), *args], capture_output=True, text=True)
            self.assertEqual(run('import', str(source)).returncode, 0)
            self.assertEqual(run('update', '1', '--follow_up', '2026-11-06').returncode, 0)
            result = run('list', '--search', 'CALL', '--due-by', '2026-11-06')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual([row['name'] for row in json.loads(result.stdout)], ['Example One'])
            self.assertEqual(json.loads(run('list', '--due-by', '2026-11-05').stdout), [])
            exported = root / 'export.csv'
            result = run('export', str(exported), '--search', 'one', '--due-by', '2026-11-06')
            self.assertEqual(result.returncode, 0, result.stderr)
            before = exported.read_bytes()
            rows = list(csv.DictReader(io.StringIO(before.decode('utf-8'))))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['follow_up'], '2026-11-06')
            self.assertEqual(run('export', str(exported)).returncode, 1)
            self.assertEqual(exported.read_bytes(), before)
            self.assertEqual(run('update', '1', '--follow_up', '2026-02-30').returncode, 1)
            self.assertEqual(run('list', '--due-by', 'invalid').returncode, 2)
            self.assertEqual(run('update', '1', '--follow_up', '').returncode, 0)
            self.assertEqual(json.loads(run('list', '--due-by', '2026-11-06').stdout), [])


if __name__ == '__main__':
    unittest.main()
