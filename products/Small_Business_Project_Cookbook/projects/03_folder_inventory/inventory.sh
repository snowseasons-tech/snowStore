#!/usr/bin/env bash
# GOAL: inspect regular files in one directory without modifying them.
# RUN: bash inventory.sh "sample files" from this recipe directory.
# Hidden regular files are included; subfolders and symbolic links are skipped.
fail() { printf 'Error: %s\n' "$1" >&2; exit 1; }
if [[ "$#" -ne 1 ]]; then
    printf 'Usage: bash inventory.sh "directory path"\n' >&2
    exit 1
fi
folder=$1
[[ -d "$folder" && -r "$folder" && -x "$folder" ]] || fail "Directory is missing or unreadable."
# nullglob prevents an empty directory from leaving a literal * pattern.
# dotglob includes hidden entries; Bash still excludes . and .. here.
shopt -s nullglob dotglob
count=0
for entry in "$folder"/*; do
    # A symbolic link may point outside the chosen directory; skip it.
    if [[ -f "$entry" && ! -L "$entry" ]]; then
        # %q prints a shell-escaped name, so spaces or newlines remain identifiable.
        printf 'File: %q\n' "${entry##*/}"
        count=$((count + 1))
    fi
done
printf 'Regular files: %s\n' "$count"
