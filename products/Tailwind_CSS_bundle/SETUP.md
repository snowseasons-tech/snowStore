# Set up the styling lessons
Extract the ZIP. Open free_starter/index_solution.html in a browser. Edit index_starter.html and styles_starter.css in a plain-text editor. Save and refresh the starter page after every change. Keep matching HTML and CSS files together.

## Tailwind build setup
Use a currently supported Node.js LTS release from https://nodejs.org/en/download . Follow its operating system instructions. Open a terminal in the extracted Tailwind_CSS_bundle folder and check:
```
node --version
npm --version
```
Install the declared Tailwind v4 dependencies, then build:
```
npm install
npm run build:css
```
After a successful build, open paid_pack/index_solution.html. Generated paid_pack/assets/tailwind.css supplies its styles. To rebuild automatically while editing, run `npm run watch:css`; keep that terminal open and press Ctrl+C to stop. Refresh the browser to see changes.

npm install creates package-lock.json. Keep it for repeatable installs; after a lockfile exists use npm ci on a fresh machine. This authoring environment has not installed the dependencies, so no lockfile or compiled Tailwind output is provided. The version range allows compatible v4 releases; review and test resolved versions before publishing your product.

If PowerShell blocks the npm.ps1 wrapper on Windows, try npm.cmd with the same arguments rather than relaxing execution policy. A command not found error means Node/npm installation or PATH needs attention. A blank-looking Tailwind page usually means the build failed, the output file is missing or the link path is wrong. Read the first build error before retrying.

References: https://tailwindcss.com/docs/installation/tailwind-cli and https://tailwindcss.com/docs/detecting-classes-in-source-files . This uses v4 @import and @source, not the older v3 init workflow.
