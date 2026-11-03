# Set up and run Bash
## Linux
Open Terminal and enter `bash --version`. You need Bash 3.2 or later. If missing, follow your distribution's official installation instructions.

## macOS
Open Terminal and enter `bash --version`. Run the lessons explicitly with bash even if your normal shell is zsh. The scripts avoid features introduced after Bash 3.2; macOS execution still needs verification before release.

## Windows
Use Windows Subsystem for Linux, rather than running the scripts in PowerShell. Follow Microsoft's installation guide: https://learn.microsoft.com/en-us/windows/wsl/install . Installing WSL may require administrator access and a restart. Once installed, open the Linux distribution terminal and enter `bash --version`. If WSL is unavailable on your work computer, ask your administrator before changing its configuration.

## Open the extracted course
Extract the ZIP first. Type `cd ` followed by the folder path in double quotes. Example for Linux or macOS: `cd "$HOME/Downloads/bash_course_bundle"`. Replace that path with the actual extracted location. In WSL a Windows download might be under `/mnt/c/Users/YOUR_NAME/Downloads`; use your actual Windows username.

`pwd` displays your current folder. `ls` lists the entries there. Confirm you see README.md, SETUP.md, free_starter and paid_pack.

Run `bash free_starter/folders_solution.sh`. Then run `bash free_starter/folders_starter.sh` after making your edits. You do not need chmod or sudo. Always launch a script with bash, not sh.

Save edited scripts as plain text with LF line endings. A bad interpreter or a message containing $'\r' often means Windows CRLF line endings were introduced; switch your editor's line-ending setting to LF and save again.

Reference: https://www.gnu.org/software/bash/manual/bash.html
