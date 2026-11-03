# Exercise answers
## Session 1
Add `materials = Decimal(input("Materials: ").strip())` after reading rate. Extend the if condition with `or not materials.is_finite() or materials < 0`. Inside else use `total = hours * rate + materials`.

## Session 2
Read discount_percent using Decimal before validation. Reject nonfinite values before comparing them. Extend the invalid condition with `or not discount_percent.is_finite() or discount_percent < 0 or discount_percent > 100`. Calculate subtotal, discount, then total inside else. See quote_solution.py for the explicit cents rounding version.

## Session 3
hello fails conversion. -1 fails the lower bound. NaN fails is_finite. 1.234 fails the two-decimal-place check. A valid 3 returns to main and moves on to rate.

## Practice
1. Update both the first print in main and the first line of text. Run and save to confirm both changed.
2. In calculate use `subtotal = labor + materials + Decimal("20.00")`. In text add `"Travel fee: $20.00\n"` as another string line. The original sample becomes subtotal $195.00, discount $19.50, total $175.50. Keep the fee visible so the breakdown adds up.
3. The code divides by 100. Entering 0.10 would mean one tenth of one percent.
4. Labor $200.00, subtotal $230.00, discount $23.00, total $207.00.
5. Example: 4 hours at 60 plus 40 materials, five percent discount: subtotal $280.00, discount $14.00, total $266.00. Without the travel-fee change, the saved output should match.
