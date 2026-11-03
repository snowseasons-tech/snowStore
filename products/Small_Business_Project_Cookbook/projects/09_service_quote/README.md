# Recipe 09 Interactive service quote

**Outcome:** Calculate a pretax practice estimate with native form constraints, function validation and a clear breakdown.

**Languages:** HTML, CSS and JavaScript. **Time:** 60–90 minutes.

**Files:** [projects/09_service_quote](projects/09_service_quote/).

### Ingredients

Browser and editor. This recipe adapts the JavaScript paid lesson pack and includes commented starter and solution files.

### Method

1. Open projects/09_service_quote/index_solution.html locally. Calculate using its default inputs.
2. Compare quote.js (calculation) and app_solution.js (form events). Trace the named result object to the displayed breakdown.
3. Change a field after calculation; the old estimate must be cleared. Try invalid or fractional input and use Reset inputs.
4. Work through the copied LESSON.md to extend index_starter.html and app_starter.js from labor-only output to the full calculation.

### Expected result

Default subtotal $175.00, discount $17.50 and estimate $157.50. With 4 hours, $60 rate, $40 materials and 5 percent discount, total $266.00.

### Make it your own

Show labor and materials separately using textContent and formatted amounts. Answer: quote.laborCents and quote.materialsCents contain those values; divide by 100 only for currency display. Keep the try/catch and stale-output behavior.

### Error handling and limits

Only bounded whole hours, whole-dollar inputs and whole-percent discounts are accepted. Tax, billing, saved estimates and payment processing are absent. A future backend must independently validate inputs; client-side constraints do not establish server trust.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.
