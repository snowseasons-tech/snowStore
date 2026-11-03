# Show a price when a visitor clicks
## Goal
Connect a button to a displayed practice hourly rate. JavaScript adds behavior to the supplied HTML. HTML gives elements ids so JavaScript can find them. No installation is needed beyond an editor and browser.

## 1 Run the solution
Follow SETUP.md. Open index_solution.html and activate Show practice rate. Expect Practice hourly rate: $50.00. Tab to the button and press Enter or Space to test native keyboard behavior.

## 2 Read the commented code
Open app_solution.js. const binds a name to a value that will not be reassigned. querySelector finds the first matching element; # means an id selector. If no element matches it returns null. The guard checks both controls exist before using them. || means either condition, and ! reverses a truth value.

addEventListener registers a function to run later when a click occurs. The code inside the function's braces does not run until that event. textContent changes plain text. A template literal uses backticks and ${...} inserts an expression. Intl.NumberFormat formats US dollar display. Store the rate in cents and divide by 100 only for display.

## 3 Edit your starter
Open app_starter.js and change hourlyRateCents from 5000 to 6500. Save. Open index_starter.html and refresh. Click the button and expect $65.00. Do not open the solution HTML when testing starter edits; each loads its matching script.

## 4 Practice
A. Change the button text in index_starter.html.
B. Change the displayed sentence in app_starter.js without changing the calculation.
C. Try a rate of 7500 cents and predict the display.
D. Change the HTML button id temporarily, check the Console message, then restore the matching id.

## Answers and completion
A. Edit the words inside button. B. Keep the template expression, change the surrounding words. C. $75.00. D. The guard reports missing price controls; matching ids reconnect them. You pass when pointer and keyboard activation work and you can explain why the callback runs later.

If nothing happens, check that JavaScript is enabled, the src filename matches the file beside the page and ids match selectors. Use the browser Console for the exact error. Save and refresh after changes.
