# Build an interactive service quote calculator
## Session 1 Understand the supplied form
Open index_solution.html and calculate with defaults: 3 hours, $50 hourly, $25 materials and 10 percent discount. Expect subtotal $175.00, discount $17.50 and total $157.50. This is a practice estimate before tax, not a quote submission service.

Open index_starter.html and app_starter.js in your editor. The starter deliberately calculates labor only; with defaults it displays $150.00. The same form is supplied so you can extend behavior without writing all the HTML first. Each HTML file loads quote.js then its corresponding app script using defer.

Read the labels and inputs. id links each input to its label and JavaScript selector. required, min, max and step define browser constraints. step="1" means whole-number increments. Try a blank hours field, zero hours and a fractional hour; browser validation should prevent the estimate from being submitted. Exact messages vary by browser.

## Session 2 Calculate using a function
Read quote.js. A function takes named inputs and returns a result. calculateQuote accepts hours, rateDollars, materialsDollars and percent. It checks safe integers and allowed ranges before doing arithmetic; invalid inputs throw an Error. The returned object contains named properties such as totalCents.

Task: in app_starter.js add selectors for materials and percent near the existing selectors. Extend the missing-element guard to include them. Inside the submit handler, replace the labor calculation and result assignment with a call to calculateQuote using all four valueAsNumber properties. Then display quote.totalCents divided by 100 with two decimals. See answers.md if stuck.

Important: the starter's DOM inputs validate normal form use, but a reusable function must validate its own inputs too. Browser-only validation is not sufficient for a production service that accepts requests; a future backend must independently validate requests. This project sends no requests.

## Session 3 Format results and handle failures
Compare app_solution.js. try runs the calculation; catch turns a rejected calculation into readable page text. Intl.NumberFormat formats currency for display. textContent inserts plain text; avoid using innerHTML to display user input. The report shows subtotal, discount and total so the result can be checked.

Task: adopt the completed try/catch and display pattern in your starter. Keep the input listener that clears stale output and reset listener that clears the result. A reset button restores the inputs' initial values from HTML; it does not necessarily make them blank. Enter a new hour value after calculating: the old estimate must be replaced by an inputs-changed message.

The arithmetic stores whole-dollar inputs as integer cents. Discount rounding is explicit. Do not simply remove step constraints to support fractional rates: revisit parsing, bounds, rounding and tests first. No general accounting or tax rules are implied.

## Session 4 Verify behavior
With default values expect $157.50. With 4 hours, $60 rate, $40 materials and 5 percent discount expect subtotal $280.00, discount $14.00 and total $266.00. Zero percent leaves the subtotal unchanged; 100 percent produces $0.00. Zero rate and materials are allowed; zero hours is not. Nonfinite, fractional and out-of-range function arguments are rejected.

Use Tab to reach fields and buttons. Calculate by pressing Enter within a form field. Edit a field to clear the old result. Use Reset inputs and check both fields and result text. Refresh and verify no estimate persists. Check narrow layout and Console errors. Native validation messages and assistive technology announcements still need hands-on browser testing.

## Practice
A. Change both the heading and browser title to a fictional business.
B. Show labor and materials as separate lines of plain-text output without using innerHTML. Hint: textContent with newline characters plus CSS white-space: pre-line on output.
C. Predict the result for 2 hours at $80, $30 materials and 10 percent discount.
D. Explain why Number.isSafeInteger rejects 2.5 for this course.
E. Find the difference between form reset and refreshing the page.

You pass when calculations match predictions, bad form values are blocked, changed inputs clear old output and the page works by keyboard. Compare answers.md after attempting the tasks.
