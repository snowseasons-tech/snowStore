"use strict";
// Connect the existing HTML controls to the calculator in quote.js.
const form = document.querySelector("#quote-form");
const result = document.querySelector("#quote-result");
const hoursInput = document.querySelector("#hours");
const rateInput = document.querySelector("#rate");
const materialsInput = document.querySelector("#materials");
const percentInput = document.querySelector("#percent");

// Missing controls indicate an authoring mistake; report it in developer tools.
if (!form || !result || !hoursInput || !rateInput || !materialsInput || !percentInput) {
  console.error("Missing calculator elements. Compare ids with the lesson HTML.");
} else {
  const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  // submit also works when a keyboard user presses Enter inside the form.
  form.addEventListener("submit", function (event) {
    // Prevent normal navigation; this local demonstration sends nothing.
    event.preventDefault();
    // Browser validation checks required, min, max and step constraints.
    if (!form.reportValidity()) return;
    try {
      // valueAsNumber gives a number rather than the text returned by .value.
      const quote = calculateQuote(hoursInput.valueAsNumber, rateInput.valueAsNumber,
        materialsInput.valueAsNumber, percentInput.valueAsNumber);
      // Template literals use backticks and ${...} to insert values.
      result.textContent = `Subtotal: ${dollars.format(quote.subtotalCents / 100)}. ` +
        `Discount: ${dollars.format(quote.discountCents / 100)}. ` +
        `Practice estimate before tax: ${dollars.format(quote.totalCents / 100)}.`;
    } catch (error) {
      // A readable message replaces an uncaught error if calculation rejects input.
      result.textContent = error instanceof Error ? error.message : "Could not calculate the estimate.";
    }
  });
  // Editing an input clears an old estimate so it is not mistaken for a new one.
  form.addEventListener("input", function () {
    result.textContent = "Inputs changed. Calculate to update the estimate.";
  });
  form.addEventListener("reset", function () {
    result.textContent = "Estimate cleared. Enter values and calculate again.";
  });
}
