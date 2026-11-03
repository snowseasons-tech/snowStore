"use strict";
// STARTER: begin with working labor-only behavior; extend it in LESSON.md.
const form = document.querySelector("#quote-form");
const result = document.querySelector("#quote-result");
const hoursInput = document.querySelector("#hours");
const rateInput = document.querySelector("#rate");
if (!form || !result || !hoursInput || !rateInput) {
  console.error("Missing controls. Check HTML ids.");
} else {
  form.addEventListener("submit", function (event) {
    // Keep this local example from navigating away or submitting data.
    event.preventDefault();
    if (!form.reportValidity()) return;
    // PRACTICE: call calculateQuote from quote.js with all four input values.
    const labor = hoursInput.valueAsNumber * rateInput.valueAsNumber;
    result.textContent = `Labor only: $${labor.toFixed(2)}. Materials and discounts not included yet.`;
  });
  // Clear stale output when inputs change; reset restores the HTML defaults.
  form.addEventListener("input", function () { result.textContent = "Inputs changed. Calculate again."; });
  form.addEventListener("reset", function () { result.textContent = "Estimate cleared."; });
}
