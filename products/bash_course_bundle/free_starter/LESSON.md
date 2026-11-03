# Create your first business workspace
## Outcome
Create Invoices, Receipts and Reports folders inside a new practice workspace. You will learn variables, quoted paths, command arguments and success or failure checks.

## 1 Run before editing
Complete SETUP.md. From the course folder run `bash free_starter/folders_solution.sh`. The script prints a business name and the location of a new workspace. Copy that path. List it with `ls "PASTE_WORKSPACE_PATH_HERE"`, replacing the placeholder with the printed path. Expect Invoices, Receipts and Reports. The random suffix differs on every run.

## 2 Follow the comments
Open folders_starter.sh. Read from top to bottom. The first line identifies Bash for environments that launch the file directly; our explicit bash command selects Bash itself. Assignment stores a value; `$business` retrieves it. Quotes preserve spaces in paths. Commands have arguments separated by spaces. Indentation helps people see blocks; `then` and `fi` mark the conditional block boundaries.

`mkdir -p` creates folders. `mktemp -d` chooses a new directory so this lesson does not reuse an earlier workspace. `if ! command` handles a failed command. `exit 1` stops with failure; `exit 0` reports success. The script checks filesystem operations because a full disk or missing permission can cause them to fail.

## 3 Personalize the starter
Change only the business text inside its quotes. Run `bash free_starter/folders_starter.sh`. Confirm the new name appears. Do not change HOME itself. It is a system-provided variable used to locate your home folder.

## 4 Practice
Add `"$workspace/Customers"` after `"$workspace/Reports"` on the mkdir command, before the semicolon. Save and rerun. List the newly printed workspace. Expect four folders. Earlier workspaces remain unchanged.

## Answers and understanding check
The added argument tells mkdir to create another directory. Quoting keeps a workspace path containing spaces together. Removing the quotes can split one path into multiple arguments. Every run prints a different workspace because mktemp creates one. Explain those three ideas aloud before moving on.

## Common errors
File not found: use pwd and ls to confirm your current course folder. Permission denied while creating practice data: use your own account and a writable home folder; do not add sudo as a workaround. Syntax error near then or fi: compare with the solution. Command not found after an assignment: remove spaces around the equals sign. A backslash only continues a command when it is the final character on its line.
