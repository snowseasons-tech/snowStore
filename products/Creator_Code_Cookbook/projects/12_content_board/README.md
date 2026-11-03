## Recipe 12 Searchable content board

**Build:** Turn a CSV content plan into a SQLite snapshot and a searchable local board.

**Languages:** Python, SQLite, HTML, CSS and JavaScript. **Time:** 2–3 hours.

### What you need

Python 3.11 or later with sqlite3 and a browser; content.csv, build_board.py and board_template.html.

### Build and explore

1. Inspect the four fictional content.csv rows.
2. Run `python3 projects/12_content_board/build_board.py` from the cookbook root.
3. Open the printed index.html path. Filter for ready, video and then an empty search.
4. Read the complete CSV validation, bound SQL insert and HTML escaping. Each run creates a fresh content-board-* folder.

### What to expect

Four posts, one ready. Search ready shows Desk setup tour; video shows two rows. A new content.db sits beside the self-contained HTML snapshot.

### Remix challenge and answer

Change Sketch timelapse to ready and rebuild. Answer: the new board reports two ready posts. Try a duplicate post id or invalid date: it should fail before creating output. Put <em>Sketch</em> in a title and confirm it remains literal text.

### Error handling and limits

This is a snapshot, not a live scheduler. Filtering changes visibility only. Edit CSV and rebuild to change data. The database is generated locally; there is no platform API, automatic publishing, shared editing or login. Filesystem errors may leave a partial output folder.


Commands use the cookbook root unless stated otherwise.
