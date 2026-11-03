# Build a complete service information page
## Session 1 Organize the content
Open index_solution.html, then read its comments. Work in index_starter.html, which intentionally begins with the free starter. Keep the solution beside it for comparison. Semantic elements describe purpose: header introduces, nav groups navigation, main holds primary content, section groups a topic and footer closes the page.

Task: give main `id="main-content"`. Add `id="services"` to the services section. Put a nav in header containing `<a href="#services">Services</a>`. Save and activate the link. The hash points to an id on this same page. Every id should be unique.

## Session 2 Describe services and rates
Replace the service list with two articles, each containing an h3 and p. Retain h2 for the section heading. Add a new prices section using the table in the solution as a guide. caption names the table. tr is a row, th a heading cell and td a data cell. scope="col" associates a header with its column; scope="row" identifies the row heading.

Task: add Window cleaning at $55 per hour to both the service descriptions and rate table. These are practice prices, not live offers. Verify each row has two cells and the right rate stays with the right service. Tables should represent data, not position sections around the page.

## Session 3 Add accessible navigation and questions
Add the skip link from the solution as the first item inside body. Add id main-content if not already present. The supplied CSS hides the skip link until keyboard focus reaches it. Tab through the page to reveal it, press Enter and confirm navigation reaches main content. A focus outline should remain visible.

Add a questions section containing details, summary and a paragraph. summary is the disclosure label. Activate it with keyboard and pointer. Native HTML supplies this behavior without JavaScript. Add a navigation link to the new section.

## Session 4 Verify the finished page
Compare your structure against index_solution.html. Check the browser title, one primary heading, section headings, unique ids, correct fragment targets, descriptive links and sensible reading order. Resize the browser to roughly a phone's width; content should wrap. Use Tab, Shift+Tab and Enter to navigate; use Space or Enter on the disclosure. No keyboard trap should occur.

This page has no inquiry form. mailto opens a configured mail application and may do nothing if one is unavailable; it is not a server delivery system. Publishing and domain setup belong to a later course. If you add images independently, provide useful alt text describing the image's role, or empty alt for purely decorative images; this pack does not require images.

## Practice and assessment
A. Add Window cleaning and a matching $55 row.
B. Add a navigation link to contact.
C. Write a question explaining that prices are fictional.
D. Inspect a broken fragment link, then fix it by matching href to the target id.
E. Explain why the price list is a table and the navigation is not.

You pass when every fragment link reaches its intended section, all services and rates match, the disclosure works by keyboard and the starter remains readable at a narrow width. See answers.md after trying the tasks.

## Troubleshooting
A link does not move: check its #fragment against an existing unique id. A table looks wrong: check row and cell closing tags and confirm styles.css is beside the file. Raw markup appears: check for an escaped tag or wrong filename extension. Browser recovery can conceal invalid nesting; compare the source with the solution and use the W3C HTML checker on fictional examples if desired: https://validator.w3.org/nu/ . Uploading source to an external checker transmits it, so keep real business data out of exercises.
