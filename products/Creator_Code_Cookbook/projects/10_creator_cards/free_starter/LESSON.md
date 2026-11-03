# Style your first project cards
## 1 See the outcome
Open index_solution.html, then compare index_starter.html. Both have the same semantic content. The starter intentionally lacks the card layout. Read styles_solution.css comments to connect each declaration to its visible effect.

A selector identifies elements, braces group declarations, a colon separates property and value, and a semicolon ends a declaration. `.card` selects a class. In HTML, `class="card"` attaches that group of styles; ids identify unique elements, while classes can repeat.

## 2 Control width and spacing
In styles_starter.css add `.container { max-width: 64rem; margin-inline: auto; padding: 1.5rem; }`. Save and refresh. max-width limits growth, auto inline margins center the container, and padding adds space inside it. A rem scales with the root font size. Add `.card { padding: 1.5rem; border: 1px solid #a6bacb; border-radius: .75rem; }`.

## 3 Make layout respond
Add `.projects { display: grid; grid-template-columns: 1fr; gap: 1rem; }`. Then add `@media (min-width: 48rem) { .projects { grid-template-columns: repeat(3, minmax(0, 1fr)); } }`. The default is one column; the wider condition switches to three. minmax(0, 1fr) lets each track shrink within its equal share. Resize and inspect the result.

## 4 Practice
A. Increase card padding to 2rem.
B. Change the wide layout to two columns.
C. Add a custom property for your accent color and use it on links.
D. Tab through links and confirm the focus outline stays visible.

## Answers
A. `.card { padding: 2rem; }`. B. Use repeat(2, minmax(0, 1fr)). C. `:root { --accent: #174b78; } a { color: var(--accent); }`. D. Keep :focus-visible styling; never remove focus indication without an equivalent.

If a rule has no effect, check selector spelling, class assignment, link href, braces and which file you edited. Later rules of the same specificity can override earlier ones. You pass when you can explain margin versus padding and show the one-column and wider layouts.
