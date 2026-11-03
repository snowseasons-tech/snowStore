# Build a service estimate tool
## Before you start
Complete the free lesson. Keep its instructions open if you need help running a file. Work in paid_pack. Use `py -3 quote_starter.py` on Windows or `python3 quote_starter.py` on macOS/Linux. The completed version uses quote_solution.py instead. Work in four short sessions rather than copying the solution all at once.

## Session 1 Ask for numbers
Open quote_starter.py and run it. Enter 3 and 50. The result should be $150.00. Run it again and enter a word. The program should explain what to enter.

`input()` displays a question and returns text, even if you type digits. `Decimal()` converts that text into a decimal number. The import line loads Decimal and InvalidOperation from Python's included decimal module. Use decimal numbers made from strings when calculating money.

A `try` block contains an operation that might fail. `except InvalidOperation` handles text such as hello. Indented lines belong to the block above them; use four spaces for each indentation level. `if` checks a condition. `else` runs when the condition was false. `or` means any listed condition can trigger the message. `not` reverses a condition. `is_finite()` rejects special values such as NaN and Infinity.

Task: add a materials question inside the try block. Give the response the name materials and convert it with Decimal. Add materials to the total. Extend the invalid-input condition to include materials. Check answers.md after trying it.

Checkpoint: 3 hours at 50 plus 25 materials produces $175.00.

## Session 2 Calculate a discount
A percentage is a fraction of 100. A ten-percent discount on 175 is 17.50; the remaining total is 157.50.

Task: ask for discount_percent. Compute subtotal before the discount. Calculate `discount = subtotal * discount_percent / Decimal("100")`, then `total = subtotal - discount`. Reject percentages below zero or above 100. Run with zero and 100 percent as well as ten.

The completed solution rounds labor to cents first, then computes and rounds the discount. It uses `quantize(CENT, rounding=ROUND_HALF_UP)` to make that rule explicit. With this rule, $1.005 rounds to $1.01. Rounding only the display would leave hidden fractional cents in later calculations. This is the course's teaching rule, not a universal accounting rule.

## Session 3 Ask again after a mistake
Now open quote_solution.py beside your starter. Read read_number before reading main.

`def` defines a function: a named set of steps. Its parameters are values passed into those steps. A function does not run merely because it is defined; another line must call it. `return` passes a result to the caller. `while True` repeats until a return ends the function. `continue` skips the remaining loop body and asks again.

The completed read_number function converts input, checks a permitted range, and accepts at most two decimal places. Its upper limits keep examples manageable and prevent extreme values from breaking arithmetic. Text, negative values, NaN, Infinity and values above the displayed maximum are rejected. Rejected input does not end the session.

Task: run the solution and deliberately enter hello, -1, NaN and 1.234 at the Hours prompt, then enter 3. Explain which check rejects each input. You can press Ctrl+C to cancel.

Read calculate next. It returns four values. In main, the four names on the left receive those results in the same order. The starter used one long sequence of steps; functions let us name and reuse parts of that sequence.

## Session 4 Save the estimate
Read save_estimate. Path represents a file or folder location. `Path(__file__).resolve().parent` finds the folder containing the script. The slash operator joins that location to a child folder. `mkdir(exist_ok=True)` creates estimates if needed. The timestamp supplies a distinct filename. `open("x")` creates a new file and refuses to overwrite one. `with` closes the file after writing. UTF-8 specifies the text encoding.

The OSError handler in main reports a failed save while leaving the estimate visible. You can copy it manually. The script asks before saving and writes only beside the script, inside estimates.

Run the solution with 3 hours, 50 rate, 25 materials and 10 discount. Type yes when asked. Open the reported text file. It should contain labor $150.00, subtotal $175.00, discount $17.50 and total $157.50. Run again with the same numbers and confirm the first file remains.

The final `if __name__ == "__main__"` runs main when this file is launched directly. It also lets a test import the calculation without starting the questions. `raise SystemExit` returns a status to the operating system. Ctrl+C or closed input produces a cancellation message.

## Practice and assessment
1. Change the fictional company name in both displayed and saved output.
2. Add a $20 travel fee before applying the discount. Update the saved breakdown too.
3. Explain why a ten-percent discount is entered as 10, not 0.10.
4. Verify: 2.5 hours at 80 plus 30 materials, 10 percent discount, totals $207.00 before a travel fee.
5. Final challenge: produce an estimate for your own fictional service. Write down the inputs, predict the result by hand, run the tool and explain any difference.

You pass when valid calculations match your predictions, bad input prompts again, and you can find the saved estimate. Explain one function in your own words before looking at the answers.

## Troubleshooting
IndentationError: use four spaces consistently. InvalidOperation in an edited version: compare the conversion and validation order with the solution. Wrong discount: divide by 100 once and apply it to the subtotal. Permission denied: move the extracted course to a writable Documents folder and try again. Unexpected results: record the exact inputs and displayed output before editing anything.

## Official references
Installation: https://www.python.org/downloads/
Decimal arithmetic: https://docs.python.org/3/library/decimal.html
Exceptions: https://docs.python.org/3/tutorial/errors.html
These references provide further detail; this lesson teaches only the parts needed for this project.
