# Set up SQLite
## Install the command line shell
Use the official SQLite download page: https://www.sqlite.org/download.html . You need the command line tools that include sqlite3, not just the SQLite library. Follow the platform instructions linked from the official documentation: https://www.sqlite.org/cli.html . On Windows the executable is sqlite3.exe; on macOS and Linux it is sqlite3. Linux users can use their distribution's documented package installation procedure. These lessons require SQLite 3.8 or later with foreign key support.

Open Terminal on macOS/Linux or PowerShell on Windows and run `sqlite3 --version`. If Windows has not added the tool to PATH, run it using its actual location, for example `& "C:/sqlite/sqlite3.exe" --version` in PowerShell. The ampersand launches a quoted executable path. Substitute your actual tool location in later terminal commands too.

## Open the extracted course folder
Extract the ZIP. Use `cd "PATH_TO_EXTRACTED_SQL_BUNDLE"` in your terminal, replacing the placeholder. `pwd` shows your current folder. Use `ls` on macOS/Linux or `dir` on Windows to confirm README.md, free_starter and paid_pack are present. Paths with spaces need quotes.

## Start a new starter database
Run this in your terminal:
```
sqlite3 -bail starter_practice_01.db
```
If you already used that filename for this course, use starter_practice_02.db instead. SQLite opens an existing file or creates a new one if absent. Inside the SQLite prompt, enter one line at a time:
```
.bail on
.headers on
.mode column
PRAGMA foreign_keys = ON;
PRAGMA foreign_keys;
.read free_starter/setup.sql
.read free_starter/queries_solution.sql
```
The pragma check should return 1. Dot commands start at the beginning of a line and do not take semicolons. SQL statements end with semicolons. Do not type the displayed sqlite> prompt itself. If a continued ...> prompt appears, SQLite is waiting for the rest of a statement, often its semicolon or closing quote.

## Stop on errors
-bail and .bail on stop processing on an error. In a script, statements before the failing statement may already have executed. Setup writes are grouped in a transaction: if a failed setup leaves your interactive session open, enter `ROLLBACK;` before inspecting or retrying. If the shell exits, an uncommitted transaction rolls back on close. Read the error rather than continuing blindly. A failed statement inside a transaction does not always roll back earlier successful statements automatically.

## Exit and return
Enter `.quit` to close the shell. Return using `sqlite3 -bail starter_practice_01.db`. Enable `PRAGMA foreign_keys = ON;` on each new connection before making related-table changes. For the paid lesson use a separate new filename, jobs_practice_01.db.

Reference: https://www.sqlite.org/foreignkeys.html
