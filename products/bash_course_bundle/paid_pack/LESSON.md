# Build a business records archive
## Before you begin
Complete the free lesson. This pack builds a practice archive from fictional files, then teaches a restore check. Read the comments in archive_solution.sh as you work. Use four sessions with breaks.

## Session 1 Replace repetition with a loop
Run `bash paid_pack/archive_starter.sh`. Copy the printed workspace path and inspect it. Now open archive_solution.sh and locate categories. An array groups related values. A for loop repeats its body once for each value; do begins the body and done ends it. Quoted array expansion keeps an item such as Customer Reports together.

Task: in your starter replace the single subfolder mkdir conditional with the following pattern. Keep the earlier parent and workspace creation code:
```bash
categories=("Invoices" "Receipts" "Reports" "Customers")
for category in "${categories[@]}"; do
    if ! mkdir -p "$workspace/$category"; then
        printf 'Could not create %s\n' "$category" >&2
        exit 1
    fi
done
```
Run the starter and list its new workspace. Expect four subfolders. Explain why quotes matter for folder names containing spaces.

## Session 2 Make fictional sample files
Read the sample-file loop in the solution. printf produces text and > writes it to a file. Redirection normally replaces existing content, so this project writes only into its newly created private workspace. Do not substitute an important existing folder while experimenting.

Task: inside your starter loop, after successful mkdir, add:
```bash
if ! printf 'Fictional record for %s\n' "$category" > "$workspace/$category/sample.txt"; then
    printf 'Could not write sample data.\n' >&2
    exit 1
fi
```
Run the starter. Read one file with `cat "PASTE_WORKSPACE_PATH/Invoices/sample.txt"`, replacing the placeholder. Expect Fictional record for Invoices. cat displays a text file's contents.

## Session 3 Create an archive after confirmation
Run `bash paid_pack/archive_solution.sh`. Type no first. The printed workspace contains records but no archive. Run again and type yes. Expect a new workspace, an archive location and a list of members such as ./Invoices/sample.txt. Folder order may vary.

A function names reusable steps. fail reports a problem and exits. create_archive performs the archive work. local limits a variable to its function. command -v checks dependencies. || runs an error handler when a command fails. A successful shell command returns zero; a failure returns a nonzero number.

Read the tar command: c creates, z compresses, f specifies the archive file, C selects the starting directory, and dot includes that directory's contents. The archive destination is a separate sibling folder, outside records. The solution only archives its generated records, and never deletes them.

read -r collects your answer. IFS= preserves surrounding whitespace. [[ "$answer" == "yes" ]] tests the text. yes creates an archive, while Yes, no or a blank answer skips it. This exact-match behavior is intentional and visible in the prompt.

Task: add Customers to the solution's categories array. Run again, type yes and find its sample file in the listing. Change the sample text and confirm the change after restoring in the next session.

## Session 4 Restore into a fresh practice directory
An archive listing alone does not prove you can restore useful content. Use only the archive you just generated for this exercise. Set workspace to the printed path, replacing the example:
```bash
workspace="/paste/the/printed/archive.workspace/path"
```
Create a fresh destination and extract the practice archive there:
```bash
if restored=$(mktemp -d "$workspace/restore.XXXXXX"); then
    if tar -xzf "$workspace/backup/business-records.tar.gz" -C "$restored"; then
        printf 'Restored files to %s\n' "$restored"
        cat "$restored/Invoices/sample.txt"
    else
        printf 'Restore failed; inspect the error above.\n' >&2
    fi
else
    printf 'Could not create a restore folder. Check the workspace path.\n' >&2
fi
```
x extracts, instead of creating or listing. C directs extraction into the fresh folder. Compare the restored text with `cat "$workspace/records/Invoices/sample.txt"`. They should match. This local exercise does not protect against a lost drive; an actual backup policy needs separate storage and regular restore checks.

## Assessment
Explain the roles of records and backup. Demonstrate a filename with spaces. Run with yes, no and closed input. Show the restored sample text. Explain how a failed tar operation is reported. Then teach someone else why a local archive is only one part of a backup plan.

## Troubleshooting
Required command missing: check the named command in your operating system documentation. No archive: did you type the exact word yes? Cannot create folder: check the displayed parent path and available disk space. File not found during restore: copy the path from the SAME run that created the archive. Syntax error: check quotes, do/done, then/fi and line-ending settings. Permission problems: keep exercises in your own writable folder rather than adding sudo.

## Practice
A. Add Customer Reports as a category containing a space.
B. Change the fictional sample message.
C. Confirm the script handles closed input without creating an archive.
D. Explain why backup is not a child of records.
See answers.md after attempting each task.

## References
Bash manual: https://www.gnu.org/software/bash/manual/bash.html
GNU tar manual: https://www.gnu.org/software/tar/manual/tar.html
Microsoft WSL setup: https://learn.microsoft.com/en-us/windows/wsl/install
