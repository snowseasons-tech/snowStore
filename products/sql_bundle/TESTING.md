# Verification notes
SQL scripts verified using Python's SQLite engine version 3.53.1.

Passed: both setup files, all query starter and solution files, expected customer counts, completed job total of 50000 cents, status counts, left join preserving zero-job customers, repeated rollback exercises, foreign key rejection, invalid status rejection, negative and fractional cents rejection, missing required amount rejection, integrity check, foreign key check, database backup via SQLite's API and repeat-setup failure without data loss after rollback.

The sqlite3 command-line executable was unavailable in the authoring environment. Dot commands, CSV export and .backup shell syntax were checked against official SQLite shell documentation but were not executed here. Python API backup verification does not validate the .backup shell command. Installation instructions and shell flows still require hands-on Linux, macOS and Windows testing. No claim of completed beginner pilot testing is made.
