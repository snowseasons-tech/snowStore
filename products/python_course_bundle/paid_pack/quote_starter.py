"""Start here after completing the free lesson."""
# Import tools included with Python; no package installation is needed.
# Decimal reads decimal numbers from text. InvalidOperation identifies bad input.
from decimal import Decimal, InvalidOperation

try:
    # Ask for text, then convert it. Try entering 3 for your first run.
    hours = Decimal(input("Hours: ").strip())
    # Try entering 50. Keep the input numeric: no $ sign or commas.
    rate = Decimal(input("Hourly rate: ").strip())
    # Reject nonfinite and negative inputs before calculating.
    # PRACTICE: add equivalent checks for materials after adding that question.
    if not hours.is_finite() or not rate.is_finite() or hours < 0 or rate < 0:
        print("Enter finite, nonnegative numbers.")
    # Only calculate when the invalid-input check above was false.
    else:
        # PRACTICE: ask for materials before validation, then add materials here.
        total = hours * rate
        # The f lets braces insert total into the text; :.2f shows two decimal places.
        print(f"Labor estimate: ${total:.2f}")
# If conversion fails, show guidance instead of a Python traceback.
except InvalidOperation:
    # Try entering hello to see this error message instead of a traceback.
    print("Enter numbers without currency symbols or commas.")
# Ctrl+C or closed input cancels the program with a readable message.
except (KeyboardInterrupt, EOFError):
    print("\nEstimate cancelled.")
