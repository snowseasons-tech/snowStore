## Recipe 05 Channel and post reports

**Build:** Join posts to creative series and include channels that have no published posts.

**Languages:** SQL with SQLite. **Time:** 60–90 minutes.

### What you need

SQLite shell with foreign key support; setup.sql and reports.sql.

### Build and explore

1. Open a new practice file: `sqlite3 -bail creator_posts_01.db`.
2. At the SQLite prompt enter `.bail on`, `.headers on` and `.mode column`, one per line.
3. Run `.read projects/05_post_reports/setup.sql`, then `.read projects/05_post_reports/reports.sql`.
4. Read the comments on LEFT JOIN, COUNT and NULLIF.

### What to expect

Studio Notes has two published posts and 1500 total views. Weekend Lens and Game Sketches remain in the report with zero published posts. Individual actions/views rates are 11.00%, 16.00% and NULL for zero views.

### Remix challenge and answer

Add a published Game Sketches post with 200 views in a new practice database. Answer: that channel’s published count becomes one and total views 200. Explain why the filter is in ON rather than WHERE.

### Error handling and limits

The data is fictional and manually entered. Channel names are creative series, not connected platform accounts. Enable PRAGMA foreign_keys = ON on each connection before writing related data. Rates do not imply reach quality or official platform definitions.


Commands use the cookbook root unless stated otherwise.
