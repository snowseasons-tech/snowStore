# Practice answers
## Connect the starter
Add `const materialsInput = document.querySelector("#materials");` and `const percentInput = document.querySelector("#percent");` beside the other selectors. Add `|| !materialsInput || !percentInput` to the guard.

Inside the submit listener after validity checking, use the solution's try/catch pattern. Call `const quote = calculateQuote(hoursInput.valueAsNumber, rateInput.valueAsNumber, materialsInput.valueAsNumber, percentInput.valueAsNumber);`. A simple display is `result.textContent = "Total: $" + (quote.totalCents / 100).toFixed(2);`. The completed app uses Intl.NumberFormat and includes the breakdown.

A. Edit title inside head and h1 inside header.

B. Use textContent to build a string containing labor, materials and total separated by `\n`. Add `output { white-space: pre-line; }` to styles.css. Keep the currency formatter and the try/catch. Do not add HTML tags to the string expecting textContent to render them.

C. Labor $160.00, subtotal $190.00, discount $19.00, total $171.00.

D. The learning calculator accepts whole hours and whole-dollar inputs only. Integer cents and bounded safe integers make that policy explicit; fractional business quantities need a revised design.

E. Reset returns form values to HTML defaults and runs the reset listener. Refresh reloads the document and scripts and returns to the initial page. Neither saves an estimate in this project.
