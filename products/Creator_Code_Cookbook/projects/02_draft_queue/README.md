## Recipe 02 Draft review queue

**Build:** Find drafts planned on or before a chosen date.

**Languages:** Python. **Time:** 45–60 minutes.

### What you need

Python 3.11 or later; drafts.py and drafts.csv.

### Build and explore

1. Read the sample dates and draft/published statuses.
2. Run `python3 projects/02_draft_queue/drafts.py --as-of 2026-10-29`.
3. Repeat with --as-of 2026-11-05. Read the date validation and sorted output.

### What to expect

Desk setup tour and Sketch timelapse appear first: Drafts to review: 2. The later comparison date includes Weekend photo walk for a count of 3.

### Remix challenge and answer

Change Sketch timelapse to published. Answer: at the original fixed date, only Desk setup tour remains. Try an invalid date to check the error message.

### Error handling and limits

This is a local date-based review list. It neither posts content nor claims that the planned date is the best time to post. Omit --as-of to use your computer’s local current date.


Commands use the cookbook root unless stated otherwise.
