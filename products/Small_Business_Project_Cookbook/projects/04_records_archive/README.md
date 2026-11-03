# Recipe 04 Local records archive

**Outcome:** Create fictional business records, archive them after confirmation and practice restoring them.

**Languages:** Bash. **Time:** 45–75 minutes.

**Files:** [projects/04_records_archive](projects/04_records_archive/).

### Ingredients

Bash, mkdir, mktemp and tar. This recipe adapts the commented archive solution from the Bash lesson pack.

### Method

1. Run `bash projects/04_records_archive/archive.sh` from the cookbook root.
2. First type no. Sample records are created in a new private workspace but no archive is made.
3. Run again, type yes and copy the printed workspace path. The archive contains Invoices/sample.txt, Receipts/sample.txt and Reports/sample.txt.
4. Set `workspace="PASTE_PRINTED_WORKSPACE_PATH"` in your Bash terminal, replacing the placeholder. Use the guarded restore pattern in the master cheat sheet to extract into a fresh directory.

### Expected result

A new workspace under your home directory, three sample records and, after yes, backup/business-records.tar.gz. Listing the archive shows the sample members.

### Make it your own

Add Customers to the categories array. Answer: the new archive has four sample files. Restore the archive and inspect Invoices/sample.txt before considering the exercise complete.

### Error handling and limits

The script creates new practice data, not a backup of your actual business folder. It preserves earlier runs. Failed creation exits nonzero and partial output must not be treated as a valid archive. A same-device archive does not protect against losing the device.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.
