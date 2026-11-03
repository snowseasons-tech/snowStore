#!/usr/bin/env bash
# GOAL: create fictional creator files and archive them in a new workspace.
# RUN from the cookbook root: bash projects/04_creator_archive/archive.sh
# This script never accepts an existing source folder; practice stays isolated.

# Define a reusable error reporter. $1 is its first argument.
fail() {
    printf 'Error: %s\n' "$1" >&2
    exit 1
}

# Check external commands before creating any practice data.
# command -v asks whether the command is available; >/dev/null hides its path.
for tool in mkdir mktemp tar; do
    # || runs the right side only if the left side fails.
    command -v "$tool" >/dev/null 2>&1 || fail "Required command missing: $tool"
done

# Keep all generated work in your own home folder.
practice_parent="$HOME/snow-creator-practice"
mkdir -p "$practice_parent" || fail "Cannot create the practice parent folder."
# A fresh private directory prevents overwriting files from an earlier run.
workspace=$(mktemp -d "$practice_parent/archive.XXXXXX") || fail "Cannot create a workspace."
assets="$workspace/assets"
backup="$workspace/backup"
mkdir -p "$assets" "$backup" || fail "Cannot create the practice subfolders."

# An array stores multiple names. Spaces inside quoted names are preserved.
# EDIT HERE: add "Audio" inside the parentheses to practice another folder.
categories=("Clips" "Captions" "Thumbnails")
# "${categories[@]}" expands to one argument per array item.
for category in "${categories[@]}"; do
    mkdir -p "$assets/$category" || fail "Cannot create folder: $category"
    # > writes output to a file. Here it targets a newly created private folder.
    # PRACTICE: change the sample text, then confirm it appears in the archive.
    printf 'Fictional practice asset for %s\n' "$category" \
        > "$assets/$category/sample.txt" || fail "Cannot write the sample file."
done

# Define a function that creates, then lists, an archive.
create_archive() {
    # local keeps this variable inside the function.
    local archive_path="$backup/creator-assets.tar.gz"
    # -c creates, -z compresses, -f names the archive file.
    # -C changes tar's starting folder; the final dot means its contents.
    # The destination is OUTSIDE assets, so tar cannot include its own output.
    if ! tar -czf "$archive_path" -C "$assets" .; then
        fail "Archive creation failed. Any partial output is not a valid backup."
    fi
    printf 'Archive created: %s\nContents follow:\n' "$archive_path"
    # -t lists instead of extracting. This checks that tar can read the archive.
    tar -tzf "$archive_path" || fail "Archive listing failed."
    # Listing is only a first check. The lesson also teaches a practice restore.
}

printf 'Practice workspace: %s\n' "$workspace"
# read collects text. -r treats backslashes literally; IFS= preserves spaces.
# An EOF (closed input) is treated as a cancellation, not as permission to write.
printf 'Create an archive of these fictional assets? Type yes: '
if ! IFS= read -r answer; then
    printf '\nCancelled. Practice files remain at %s\n' "$workspace"
    exit 0
fi

# [[ ... ]] is Bash's conditional test. == compares text here.
# Only the exact answer yes creates the archive. Empty input cancels.
if [[ "$answer" == "yes" ]]; then
    create_archive
else
    printf 'Skipped archive creation. Practice files remain at %s\n' "$workspace"
fi
exit 0
