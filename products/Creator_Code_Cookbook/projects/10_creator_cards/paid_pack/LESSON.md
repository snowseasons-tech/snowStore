# Rebuild your cards with Tailwind
## Session 1 Connect the build
Complete SETUP.md. Run npm install and npm run build:css from the bundle root. Open paid_pack/index_solution.html. Compare its cards with the plain CSS solution. Tailwind generates CSS from utility class names found in your source files; a browser does not interpret utility names without the generated stylesheet.

Read src/input.css. @import loads Tailwind v4. source(none) disables automatic discovery so the two @source paths explicitly state which HTML to scan. The paths are relative to that CSS file. If you later move or add templates, update these sources.

## Session 2 Translate CSS concepts
Open index_starter.html. It begins with one-column grid at all widths. Add md:grid-cols-3 to its grid class list and rebuild. grid sets display grid, grid-cols-1 sets a single track, gap-4 adds spacing, and md:grid-cols-3 changes the columns at the medium breakpoint. Unprefixed classes apply first; responsive prefixes apply at that width and above.

Find rounded-xl, border, border-slate-300, bg-white and p-6 on each card. They correspond to border radius, border width, border color, background and padding. Utilities change presentation, so retain article, headings and meaningful link text. Tailwind's reset styles mean headings, lists and links may need explicit styling; the example includes font and underline utilities.

## Session 3 Brand and focus states
@theme declares --color-brand in src/input.css. Task: add text-brand to the h1 class list, rebuild, and inspect it. Add hover:text-blue-950 to a link but keep focus-visible:outline-2 and focus-visible:outline-offset-4 for keyboard users. Hover alone is not a keyboard interaction cue.

Tailwind detects complete class names in source. Do not build names by concatenating fragments such as 'bg-' plus a color variable. Use complete literal alternatives if JavaScript later toggles classes. A class that the build never sees may not have generated CSS.

## Session 4 Verify and compare
Compare the plain CSS and Tailwind solutions at narrow and wide widths. Inspect computed styles in browser developer tools. Verify text contrast, visible keyboard focus, readable line length and no clipped cards. Test your own breakpoints rather than assuming a laptop view covers phone users.

Tasks: switch medium layout to two columns; increase card padding to p-8; add a fourth card; demonstrate that a source change needs rebuilding. After adding the card, its natural wrap to a second row is expected. Revert one change and predict the result before refreshing.

## Completion
Explain how CSS properties map to three utility classes. Show the generated CSS file, identify its source and rebuild after an edit. You pass when both versions remain readable and all links work by keyboard. Check answers.md after trying the tasks.
