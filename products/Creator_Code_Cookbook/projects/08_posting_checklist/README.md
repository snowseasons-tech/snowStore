## Recipe 08 Saved posting checklist

**Build:** Save a personal pre-share checklist in your browser.

**Languages:** HTML, CSS and JavaScript. **Time:** 60–90 minutes.

### What you need

A browser; Python 3 can serve the page at a stable local origin.

### Build and explore

1. Run `python3 -m http.server 8080 --bind 127.0.0.1 --directory projects/08_posting_checklist`.
2. Open http://127.0.0.1:8080/, check a task and refresh at the same address.
3. Read checklist.js: the versioned key, JSON shape checks and storage error handling.
4. Try Clear completed tasks, then stop the server with Ctrl+C.

### What to expect

Three review tasks covering the idea/media, caption/private details and accessible text. When browser storage is available, checks survive refresh.

### Remix challenge and answer

Add a new task only after updating the ids array and storage version. Answer: the existing stored array has the old length, so change the key version or write an explicit migration. Do not clear unrelated localStorage keys.

### Error handling and limits

Blocked storage or invalid saved data produces a readable message. File-URL storage is inconsistent, so use the loopback server for this exercise. These checks are personal reminders, not automated content review or a shared audit trail.


Commands use the cookbook root unless stated otherwise.
