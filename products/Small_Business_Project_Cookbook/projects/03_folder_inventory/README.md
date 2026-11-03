# Recipe 03 Read-only folder inventory

**Outcome:** List regular files in one folder, including hidden files, without moving or changing them.

**Languages:** Bash. **Time:** 30–45 minutes.

**Files:** [projects/03_folder_inventory](projects/03_folder_inventory/).

### Ingredients

Bash 3.2 or later. On Windows use WSL. Files: inventory.sh and the fictional sample files directory. No sudo or chmod is needed when invoking bash.

### Method

1. From the cookbook root run `bash projects/03_folder_inventory/inventory.sh "projects/03_folder_inventory/sample files"`.
2. Read the comments about nullglob, dotglob and symbolic links.
3. Compare the printed escaped filenames with the directory contents.
4. Run against an empty practice directory and then a nonexistent directory to compare success and failure.

### Expected result

Three file entries and Regular files: 3. A filename containing a space may be displayed with a backslash because printf %q uses shell-escaped output.

### Make it your own

Add a fourth plain-text sample file and a subfolder. Answer: regular file count becomes four, not five. A symlink is skipped even if it points to a regular file. Try a path with spaces to check quoting.

### Error handling and limits

Only one directory level is inspected. Symlinks and subdirectories are excluded. The tool checks access to the directory but does not read or validate the contents of each file. Output is printed to the terminal; redirecting it with > is a separate action that can replace an existing destination.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.
