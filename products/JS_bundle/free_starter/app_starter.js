"use strict";
// RUN: open index_starter.html or index_solution.html in a browser.
// This file is JavaScript, not a terminal command. // begins a comment.
// const names a value that this script will not reassign.
const button = document.querySelector("#show-price");
const result = document.querySelector("#price-result");

// Guard against mismatched HTML ids instead of crashing on a missing element.
if (!button || !result) {
  console.error("Missing price controls. Check the HTML ids.");
} else {
  // PRACTICE: set the rate to 6500 cents.
  // EDIT HERE: whole cents avoid fractional money storage in this example.
  const hourlyRateCents = 5000;
  // Intl.NumberFormat formats dollars for display; it does not change storage.
  const dollars = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  });
  // addEventListener waits for a click. The function runs only when clicked.
  button.addEventListener("click", function () {
    // Divide cents by 100 for display, then write plain text into the page.
    // textContent treats the value as text rather than parsing HTML.
    result.textContent = `Practice hourly rate: ${dollars.format(hourlyRateCents / 100)}`;
  });
}
