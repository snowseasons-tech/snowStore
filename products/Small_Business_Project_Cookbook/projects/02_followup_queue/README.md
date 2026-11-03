# Recipe 02 Customer follow-up queue

**Outcome:** List open follow-ups due on or before a chosen date, without sending messages.

**Languages:** Python. **Time:** 45–60 minutes.

**Files:** [projects/02_followup_queue](projects/02_followup_queue/).

### Ingredients

Python 3.11 or later. Files: followups.py and customers.csv. The fixed comparison date below makes results repeatable.

### Method

1. Read the four sample rows in customers.csv. open and closed are the only allowed statuses.
2. Run `python3 projects/02_followup_queue/followups.py --as-of 2026-10-29`.
3. Trace date.fromisoformat, the open-status check and the final sort in the commented source.
4. Run again with `--as-of 2026-11-05` and compare the queue. Omit --as-of to use your computer's local current date.

### Expected result

For 2026-10-29, Aspen Cleaning and Cedar Repairs appear in date order; Due follow-ups: 2. Pine Office is excluded because it is closed.

### Make it your own

Move Frost Studio's follow-up to 2026-10-28 in a copy. Answer: three due tasks at the fixed date, sorted Aspen, Frost, Cedar. Set a status to pending and confirm the script rejects it instead of guessing its meaning.

### Error handling and limits

Dates and statuses are checked before a report prints. This is a date-only workflow and does not schedule reminders, interpret time zones or contact customers. Use the result as a manual work queue.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.
