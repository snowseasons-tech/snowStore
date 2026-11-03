## Recipe 04 Creator asset archive

**Build:** Archive fictional clips, captions and thumbnail notes into a fresh workspace.

**Languages:** Bash. **Time:** 45–75 minutes.

### What you need

Bash, mkdir, mktemp and tar. No admin permissions are needed.

### Build and explore

1. Run `bash projects/04_creator_archive/archive.sh`.
2. Type no first; sample assets are created but no archive is made.
3. Run again, type yes and copy the printed workspace path. Use the master cheat sheet’s guarded restore command to extract the archive into a new folder.

### What to expect

A fresh directory under your home folder with Clips/sample.txt, Captions/sample.txt and Thumbnails/sample.txt. A confirmed run creates backup/creator-assets.tar.gz.

### Remix challenge and answer

Add Audio to the categories array. Answer: the next archive contains four sample asset files. Restore and read Clips/sample.txt to check its contents.

### Error handling and limits

This example creates fictional assets rather than archiving your actual media library. The archive is local and unencrypted; it does not protect against losing the drive. Each run preserves earlier workspaces.


Commands use the cookbook root unless stated otherwise.
