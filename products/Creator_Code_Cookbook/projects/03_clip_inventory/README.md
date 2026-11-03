## Recipe 03 Clip folder inventory

**Build:** See what is inside one project folder without renaming or moving files.

**Languages:** Bash. **Time:** 30–45 minutes.

### What you need

Bash 3.2 or later; Windows uses WSL. Sample files are fictional text notes, not actual clips.

### Build and explore

1. Run `bash projects/03_clip_inventory/inventory.sh "projects/03_clip_inventory/sample clips"`.
2. Read the comments explaining quoted paths, the loop and printf %q.
3. Try an empty folder and a missing folder.

### What to expect

Three regular files. Spaces appear shell-escaped in the listing so filenames remain identifiable.

### Remix challenge and answer

Add one more text note and a subfolder. Answer: regular file count becomes four; the subfolder is not counted. A symlink is also skipped.

### Error handling and limits

This is a one-level inventory, not a recursive media scanner. Hidden regular files are included. The script does not modify source files or inspect their contents.


Commands use the cookbook root unless stated otherwise.
