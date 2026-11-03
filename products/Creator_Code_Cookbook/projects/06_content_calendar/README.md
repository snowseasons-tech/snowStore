## Recipe 06 Content calendar queries

**Build:** Filter a content plan by date and practice a status change you can undo.

**Languages:** SQL with SQLite. **Time:** 45–75 minutes.

### What you need

SQLite shell; calendar.sql. Use a fresh database separate from recipe 5.

### Build and explore

1. Open `sqlite3 -bail creator_calendar_01.db` from the cookbook root.
2. Enter `.bail on`, `.headers on` and `.mode column` on separate lines.
3. Run `.read projects/06_content_calendar/calendar.sql` once. Read the date-window query and BEGIN/UPDATE/ROLLBACK sequence.

### What to expect

Three planned posts fall in the 2026-10-29 to before 2026-11-02 window. Post 2 changes to ready inside the transaction and returns to draft after rollback.

### Remix challenge and answer

Copy only the report query and filter for status ready. Answer: Desk setup tour. Do not rerun setup in the same database, because it deliberately refuses to recreate its table.

### Error handling and limits

ISO dates are stored as text; the schema alone does not validate calendar dates. A script error can leave an interactive transaction open: use ROLLBACK before starting over. This is not an automatic posting scheduler.


Commands use the cookbook root unless stated otherwise.
