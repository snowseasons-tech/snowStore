#!/usr/bin/env bash
# STARTER: edit the business name, then add the Customers folder.
# LESSON GOAL: create a small workspace for fictional business records.
# RUN from the course folder: bash free_starter/folders_solution.sh
# For the starter file, replace solution with starter in the command above.
# Lines starting with # are comments: Bash reads them as explanations.

# A variable gives a name to a value. Do not add spaces around the equals sign.
# EDIT HERE: change Practice Service Co to another fictional business name.
business="Practice Service Co"

# $HOME is your home folder. Keep it unchanged; store our path in a new name.
# Quotes make the entire path one argument even if it contains spaces.
practice_parent="$HOME/snow-bash-practice"

# mkdir creates a folder; -p allows the parent folder to exist already.
# if ! means: run the following error-handling block if the command fails.
if ! mkdir -p "$practice_parent"; then
    # >&2 sends error text to the terminal's error output stream.
    printf 'Could not create the practice parent folder.\n' >&2
    # A nonzero exit status reports that the script failed.
    exit 1
fi

# mktemp -d creates a NEW private folder; XXXXXX is replaced with random text.
# $(...) captures the command's output as the value of workspace.
# Each run uses a new folder, so your earlier practice stays intact.
if ! workspace=$(mktemp -d "$practice_parent/workspace.XXXXXX"); then
    printf 'Could not create a fresh workspace.\n' >&2
    exit 1
fi

# PRACTICE: add "$workspace/Customers" as another argument below.
# Backslash continues a command onto the next line. Nothing may follow it.
if ! mkdir -p "$workspace/Invoices" "$workspace/Receipts" \
    "$workspace/Reports"; then
    printf 'Could not create the business subfolders.\n' >&2
    exit 1
fi

# printf prints formatted text. %s inserts a value; \n starts a new line.
# Put variable data in arguments, not in the format string.
printf 'Business: %s\nWorkspace: %s\n' "$business" "$workspace"
# Exit status zero means the task completed successfully.
exit 0
