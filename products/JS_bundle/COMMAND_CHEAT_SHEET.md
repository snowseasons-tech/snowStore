# JavaScript Command and Syntax Cheat Sheet
These examples run in a webpage's JavaScript file, not a Bash terminal. Save the .js file, then refresh its matching HTML page. The browser Console is useful for inspecting errors. No Node.js installation is needed for these lessons.

| Syntax or method | Purpose |
| --- | --- |
| `// Explain a step` | Single-line comment; do not store secrets in browser source. |
| `const rateCents = 5000;` | Name a value without reassignment. |
| `let count = 0;` | Name a value you intend to reassign. |
| `count = count + 1;` | Assign the incremented value. |
| `value === 10` | Strict equality without automatic type conversion. |
| `value !== 10` | Strict inequality. |
| `a && b` | Both conditions must be truthy. |
| `a || b` | At least one condition must be truthy. |
| `!value` | Reverse truthiness. |
| `document.querySelector("#hours")` | Find the first matching element, or null if missing. |
| `input.value` | Read input as text. |
| `input.valueAsNumber` | Read a numeric input as a number; invalid or blank can give NaN. |
| `Number.isFinite(value)` | Check that a numeric value is finite. |
| `Number.isSafeInteger(value)` | Check that it is an exactly representable safe integer. |
| `element.textContent = "Ready";` | Replace element contents with plain text. |
| `form.reportValidity()` | Check form constraints and show browser feedback. |
| `event.preventDefault()` | Cancel a default event action, such as normal form navigation. |
| `console.error("Missing control");` | Report an authoring problem in developer tools. |
| `Math.round(value)` | Round to the nearest integer; consider the sign and tie policy for money. |
| `amount.toFixed(2)` | Return a display string with two decimal places, not an exact-money storage type. |

## Connect a button
```javascript
const button = document.querySelector("#show-price");
const result = document.querySelector("#price-result");
if (button && result) {
  button.addEventListener("click", function () {
    result.textContent = "Practice rate: $50.00";
  });
} else {
  console.error("Expected button or result is missing.");
}
```

## Define and call a function
```javascript
function centsToDollars(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("Expected nonnegative whole cents.");
  }
  return cents / 100;
}
try {
  console.log(centsToDollars(5000)); // Displays 50 in the Console.
} catch (error) {
  console.error(error);
}
```
A function runs when called. Parameters name inputs; return passes a result back. try/catch handles an error where recovery or user feedback is possible.

## Arrays and objects
```javascript
const services = ["Office cleaning", "Move out cleaning"];
const quote = { subtotalCents: 17500, totalCents: 15750 };
console.log(services[0]); // First item; indexes begin at zero.
console.log(quote.totalCents); // Named property: 15750.
```

## Currency display
```javascript
const dollars = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD"
});
console.log(dollars.format(15750 / 100)); // $157.50
```
Formatting is presentation, not exact decimal arithmetic. This pack uses bounded whole-dollar inputs and integer cents. Revisit the calculation policy before adding fractional quantities or tax.

## Load JavaScript from HTML
```html
<script src="quote.js" defer></script>
<script src="app_solution.js" defer></script>
```
These are classic scripts. defer waits for document parsing and keeps their execution order. Keep both files beside the HTML. Do not load starter and solution app scripts together; each registers its own handlers and declares the same top-level names.

## Forms and validation
Listen for submit on the form, not only click on its button, so keyboard submission works. Use labeled inputs with required, min, max and step. Clear stale results on input. Listen for reset to clear results; reset restores HTML defaults. Native browser validation often blocks invalid form submissions before the submit callback runs. The solution also validates function inputs independently.

Client-side controls do not provide server security. A future backend needs independent validation and authorization. Use textContent for plain text; innerHTML parses markup and is inappropriate for displaying untrusted input here. This bundle stores no data and sends no requests.

## Troubleshooting
| Symptom | Check |
| --- | --- |
| Button has no effect | Confirm correct HTML, src filename, matching ids and JavaScript enabled. |
| Cannot read properties of null | A selector did not find an element; compare ids and defer usage. |
| Unexpected token | Check quotes, parentheses and matching braces. |
| Number behaves like text | Check .value versus .valueAsNumber; validate before arithmetic. |
| NaN | Input was not a usable number; inspect values and validation. |
| Old result stays visible | Keep the input-change listener. |
| Changes do not appear | Save, refresh and confirm starter versus solution. |

Official references:
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide
- https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
- https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/reportValidity
