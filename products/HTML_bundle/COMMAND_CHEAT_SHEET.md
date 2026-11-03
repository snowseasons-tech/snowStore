# HTML Tag and Editing Cheat Sheet
HTML uses tags and attributes rather than terminal commands. Edit the source, save it, then refresh your local browser page. Examples are fragments to place inside a complete document.

| Tag or pattern | Purpose |
| --- | --- |
| `<!doctype html>` | Select modern HTML rendering at the start of a document. |
| `<html lang="en">` | Root element with the content language. |
| `<meta charset="utf-8">` | Set text encoding inside head. |
| `<meta name="viewport" content="width=device-width, initial-scale=1">` | Support layout at device width. |
| `<title>Practice business</title>` | Browser tab label inside head. |
| `<link rel="stylesheet" href="styles.css">` | Load a CSS file beside the HTML document. |
| `<header>...</header>` | Introductory content. |
| `<nav aria-label="Page sections">...</nav>` | Group navigation links. |
| `<main id="main-content">...</main>` | Primary content and fragment target. |
| `<section><h2>Services</h2>...</section>` | Group a topic under a heading. |
| `<article><h3>Office care</h3><p>Details.</p></article>` | A self-contained description. |
| `<h1>Practice business</h1>` | Primary page heading for these lessons. |
| `<p>Service details.</p>` | Paragraph. |
| `<ul><li>Office cleaning</li></ul>` | Unordered list and an item. |
| `<a href="#services">Services</a>` | Link to the element with id services. |
| `<a href="mailto:hello@practice.example">Email</a>` | Ask a configured mail app to compose; fictional address. |
| `<strong>Important detail</strong>` | Mark importance. |
| `<em>Emphasized wording</em>` | Mark emphasis. |
| `<details><summary>Question</summary><p>Answer.</p></details>` | Native expandable disclosure. |
| `<footer>...</footer>` | Closing page information. |
| `<!-- Explain this step -->` | HTML comment; visible in source, so never store secrets here. |

## Tables
```html
<table>
  <caption>Practice hourly rates</caption>
  <thead><tr><th scope="col">Service</th><th scope="col">Rate</th></tr></thead>
  <tbody><tr><th scope="row">Office cleaning</th><td>$50</td></tr></tbody>
</table>
```
Use tables for related data. Keep row lengths consistent. Caption names the table; header scopes describe which cells the headings apply to.

## Attributes and text
Quote attribute values. id must be unique on a page. href describes a link destination. class selects a CSS styling group; the provided CSS handles presentation. Use `&amp;` for an ampersand, `&lt;` for a literal less-than sign and `&gt;` for greater-than. Most elements need closing tags; meta, link, img and input are examples of void elements.

## Everyday editing checks
| Action | How |
| --- | --- |
| Open a local page | Browser Open File or file manager; choose the extracted .html file. |
| See edits | Save in the editor, then refresh the browser. |
| Compare starter and solution | Open both source files in your editor. |
| Check keyboard use | Tab and Shift+Tab move focus; Enter activates links. |
| Check disclosure | Focus summary and use Enter or Space. |
| Inspect structure | Use the browser's Inspect or Developer Tools menu. |
| Check narrow layout | Resize the browser and look for clipped content. |

## Form markup preview
The JavaScript bundle introduces working client-side form behavior. A basic label/control pair is `<label for="hours">Hours</label><input id="hours" type="number" min="1" max="40" step="1" required>`. Match for to id. A label is not replaced by placeholder text. HTML alone does not store or email submitted information.

Official reference: https://developer.mozilla.org/en-US/docs/Web/HTML
