# CSS and Tailwind Cheat Sheet
## CSS essentials and v4 utility mappings
| Goal | Plain CSS | Tailwind example |
| --- | --- | --- |
| Block layout | display: block | block |
| Grid layout | display: grid | grid |
| One column | grid-template-columns: repeat(1,minmax(0,1fr)) | grid-cols-1 |
| Three columns | grid-template-columns: repeat(3,minmax(0,1fr)) | grid-cols-3 |
| Medium three columns | wider-screen media query | md:grid-cols-3 |
| Internal spacing | padding: 1.5rem | p-6 under the default spacing theme |
| External top space | margin-top: 2rem | mt-8 under the default spacing theme |
| Grid spacing | gap: 1rem | gap-4 under the default spacing theme |
| Center container | margin-inline: auto | mx-auto |
| Limit width | max-width: 64rem | max-w-5xl under the default theme |
| Bold text | font-weight: 700 | font-bold |
| White background | background-color: white | bg-white |
| Rounded corners | border-radius: .75rem | rounded-xl under the default theme |
| Border | border: 1px solid | border plus a color utility |
| Hover text | a:hover { color: ... } | hover:text-blue-950 |
| Keyboard outline | :focus-visible { outline-width: 2px } | focus-visible:outline-2 |

Theme values can be customized; utility names are not promises of immutable pixel values. rem depends on root font size. Default responsive prefixes include sm, md, lg, xl and 2xl; they are minimum-width conditions, not device detectors.

## CSS syntax
```css
/* A class selector and a declaration block. */
.card { padding: 1.5rem; border: 1px solid #a6bacb; }
:root { --accent: #174b78; }
a { color: var(--accent); }
@media (min-width: 48rem) { .services { display: grid; } }
```
Margin is outside the border, padding inside it. box-sizing: border-box includes border and padding in declared dimensions. Use classes for reusable styling and ids for unique destinations. Keep focus visible and test readable contrast. Avoid using !important as a first response to a rule conflict; inspect the cascade and specificity instead.

## Tailwind v4 source
```css
@import "tailwindcss" source(none);
@source "../index_solution.html";
@theme { --color-brand: #174b78; }
```
Source paths are relative to this CSS file. Use complete class names in scanned files. The example's @theme creates utilities such as text-brand when used. v4 uses the separate @tailwindcss/cli package; do not copy the older v3 npx tailwindcss init instructions into this project.

## Terminal commands from the styling bundle root
| Command | Purpose |
| --- | --- |
| node --version | Check Node installation. |
| npm --version | Check npm installation. |
| npm install | Install declared dependencies and create/update package-lock.json. |
| npm ci | Install from an existing matching lockfile; fails if missing or inconsistent. |
| npm run build:css | Generate the minified Tailwind stylesheet. |
| npm run watch:css | Rebuild when source changes; stop with Ctrl+C. |

Keep source HTML and CSS under review. Generated CSS is build output: rebuild it rather than editing it manually. The downloadable lesson does not include compiled Tailwind CSS; install and build first. The plain CSS lesson needs no npm.

References: https://tailwindcss.com/docs/installation/tailwind-cli and https://tailwindcss.com/docs/detecting-classes-in-source-files
