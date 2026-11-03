# Build your first business service page
## Outcome
Display a business heading, service list and contact link. HTML describes meaning and structure. Tags mark elements; attributes provide extra information. CSS controls presentation, and JavaScript adds behavior. This first lesson focuses on HTML.

## 1 Open the example
Follow SETUP.md and open index_solution.html. Expect a heading for Practice Cleaning Co, two services and an email link. Its address is fictional; do not expect an inquiry to arrive. Read the comments in the HTML file.

## 2 Understand the skeleton
The doctype requests modern HTML rendering. html lang="en" identifies the text language. head holds metadata; body holds visible content. title labels the browser tab. h1 is the page's primary heading, while h2 introduces sections. Paragraphs use p. Most elements have opening and closing tags; meta and link are void elements and do not wrap content.

## 3 Make your changes
Open index_starter.html in a text editor. Change the title and h1 to a fictional business name. Save and refresh. Add a third service using `<li>Window cleaning</li>` inside ul, before its closing tag. Change the contact link's visible wording while preserving href. Observe that the visible words and destination are separate.

## 4 Practice
A. Add a paragraph explaining your fictional service under the main heading.
B. Add a service and count the visible list items.
C. Change the browser title without changing h1. Where does the change appear?
D. Write the text `Care &amp; attention` in a paragraph. What appears?

## Answers
A. `<p>Practice cleaning for small offices.</p>` inside header after h1. B. Add another li inside ul; there should now be at least three. C. The browser tab changes, while the on-page heading remains. D. Care & attention; &amp; encodes an ampersand in HTML.

## Finish and diagnose
Check opening and closing tags, indentation and filenames. If text seems to belong to the wrong section, inspect misplaced closing tags. Browsers often recover from mistakes, so appearance alone does not prove valid HTML. You pass when you can edit a heading, add a list item and explain href versus visible link text.
