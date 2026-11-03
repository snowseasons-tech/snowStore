## Recipe 01 Post stats snapshot

**Build:** Turn a fictional CSV into a simple post-performance report.

**Languages:** Python. **Time:** 45–60 minutes.

### What you need

Python 3.11 or later; stats.py and posts.csv. No packages or social account login.

### Build and explore

1. Inspect posts.csv: title, views, likes, comments and saves.
2. Run `python3 projects/01_post_stats/stats.py` from the cookbook root.
3. Read summarize and the commented zero-view branch. Try a separate file by adding its quoted path to the command.

### What to expect

Three posts; 1500 total views and 190 actions. Combined actions/views is 12.67%. The zero-view post displays not available rather than dividing by zero.

### Remix challenge and answer

Add 10 saves to Sketch timelapse. Answer: 200 total actions and 13.33% combined actions/views. Try a negative count in a copy; it should fail clearly.

### Error handling and limits

The formula is (likes + comments + saves) / views × 100. It is a teaching definition, not an official platform engagement rate. Views may include repeat views and actions are not unique people. Do not average individual percentages to obtain the combined rate.


Commands use the cookbook root unless stated otherwise.
