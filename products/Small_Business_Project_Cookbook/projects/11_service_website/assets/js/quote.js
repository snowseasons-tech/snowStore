"use strict";
// Keep calculation independent from the page so it can be tested directly.
// This lesson deliberately allows WHOLE hours, dollar rates and percentages.
// Integer cents plus bounded inputs keep this example's arithmetic predictable.
function calculateQuote(hours, rateDollars, materialsDollars, percent) {
  // An array groups the four inputs; every() checks each with the same rule.
  const values = [hours, rateDollars, materialsDollars, percent];
  if (!values.every(Number.isSafeInteger)) {
    throw new Error("Enter whole numbers only.");
  }
  if (hours < 1 || hours > 40 || rateDollars < 0 || rateDollars > 1000 ||
      materialsDollars < 0 || materialsDollars > 10000 || percent < 0 || percent > 100) {
    throw new Error("Use the allowed ranges shown beside the fields.");
  }
  // Convert whole dollars to integer cents before doing money calculations.
  const laborCents = hours * rateDollars * 100;
  const materialsCents = materialsDollars * 100;
  const subtotalCents = laborCents + materialsCents;
  // Round the discount to the nearest cent; positive half cents round upward.
  // With these whole-dollar teaching inputs, the discount is already whole cents.
  const discountCents = Math.round(subtotalCents * percent / 100);
  // Return an object: named results are easier to read than positional values.
  return { laborCents, materialsCents, subtotalCents, discountCents,
    totalCents: subtotalCents - discountCents };
}
