"""Learning project: calculate and save a pretax service estimate."""
# Import tools included with Python; no package installation is needed.
# Decimal reads decimal numbers from text. InvalidOperation identifies bad input.
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
# Path helps build file locations on Windows, macOS and Linux.
from pathlib import Path
# datetime supplies the timestamp used to name each saved estimate.
from datetime import datetime

# A cent is 0.01 dollars. Uppercase marks a shared constant by convention.
CENT = Decimal("0.01")

# Define reusable input steps. prompt is the question; maximum is the allowed limit.
def read_number(prompt, maximum):
    # Repeat these indented steps until return gives back a valid number.
    while True:
        # input() returns text; strip() removes surrounding spaces.
        raw = input(prompt).strip()
        try:
            # Convert text such as "12.50" into a decimal number for arithmetic.
            value = Decimal(raw)
        # If conversion fails, show guidance instead of a Python traceback.
        except InvalidOperation:
            print("Enter a number without currency symbols or commas.")
            # Skip the rest of this loop attempt and ask the same question again.
            continue
        # Reject NaN and Infinity before comparing numbers, then enforce the range.
        # or accepts any failing condition; < and > mean less than and greater than.
        if not value.is_finite() or value < 0 or value > maximum:
            print(f"Enter a finite number from 0 to {maximum}.")
            # Skip the rest of this loop attempt and ask the same question again.
            continue
        # != means not equal. Reject values that need more than two decimal places.
        if value != value.quantize(CENT):
            print("Use no more than two decimal places.")
            # Skip the rest of this loop attempt and ask the same question again.
            continue
        # End this function and pass the accepted number back to its caller.
        return value

# Keep arithmetic separate from questions so it can be checked independently.
def calculate(hours, rate, materials, discount_percent):
    # Multiply first, then round labor to cents using an explicit rounding rule.
    labor = (hours * rate).quantize(CENT, rounding=ROUND_HALF_UP)
    # Combine labor and materials before applying the discount.
    # CHALLENGE: add a travel fee here, then include it in the saved breakdown.
    subtotal = labor + materials
    # Enter 10 for ten percent: divide by 100, then round the discount to cents.
    discount = (subtotal * discount_percent / Decimal("100")).quantize(
        CENT, rounding=ROUND_HALF_UP
    )
    # Return four results in order. main() receives them in that same order.
    return labor, subtotal, discount, subtotal - discount

# This function takes the finished text and returns the saved file location.
def save_estimate(text):
    # __file__ is this script. resolve().parent finds its containing folder.
    # The slash joins that folder to estimates; it does not divide numbers here.
    folder = Path(__file__).resolve().parent / "estimates"
    # Create the folder if needed. An existing folder is allowed.
    folder.mkdir(exist_ok=True)
    # Format local time as year, month, day, time and microseconds for the filename.
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    # An f-string inserts the timestamp into a new filename.
    destination = folder / f"estimate_{stamp}.txt"
    # Mode x creates a new file and refuses to overwrite an existing one.
    # with closes the file automatically; UTF-8 preserves text characters.
    with destination.open("x", encoding="utf-8") as output:
        # Write exactly the estimate text passed into this function.
        output.write(text)
    # Give the caller the file path so it can tell the student where to look.
    return destination

# Group the application steps together. Defining a function does not run it.
def main():
    # EDIT HERE: customize the fictional business name in this heading.
    # Also update the business name in the saved text below.
    print("Practice Service Co — estimate builder")
    # Call the input function with a question and the maximum hours allowed.
    hours = read_number("Hours: ", Decimal("1000"))
    # Reuse the same validation for the hourly dollar rate.
    rate = read_number("Hourly rate in dollars: ", Decimal("10000"))
    # Ask for material costs; enter 0 when the job has none.
    materials = read_number("Materials in dollars: ", Decimal("1000000"))
    # Enter 10 for 10 percent, 0 for none, or 100 for a full discount.
    percent = read_number("Discount percent from 0 to 100: ", Decimal("100"))
    # Receive the four returned values into four separate names.
    labor, subtotal, discount, total = calculate(hours, rate, materials, percent)
    # Build one text value from adjacent strings inside parentheses.
    # \n starts a new line; f-strings insert calculated values into the estimate.
    # EDIT HERE: change the company name on the next line as well as the heading.
    text = (
        "Practice Service Co\nESTIMATE ONLY — before tax\n"
        f"Hours: {hours}\nHourly rate: ${rate:.2f}\n"
        f"Labor: ${labor:.2f}\nMaterials: ${materials:.2f}\n"
        f"Subtotal: ${subtotal:.2f}\nDiscount ({percent}%): ${discount:.2f}\n"
        f"Total: ${total:.2f}\n"
    )
    # Display the estimate before trying to save, so it remains available on failure.
    print(text)
    # strip removes extra spaces; lower makes YES and Yes work like yes.
    # Only yes saves a file. Any other answer skips saving.
    if input("Save this estimate? Type yes: ").strip().lower() == "yes":
        try:
            # Call the save function; a filesystem failure is handled just below.
            destination = save_estimate(text)
        # Handle problems such as an unwritable folder without hiding the estimate.
        except OSError as error:
            print(f"Could not save the estimate: {error}. Copy the displayed estimate instead.")
            # Return failure status to the terminal because the requested save failed.
            return 1
        # Open the printed location in your file manager to inspect the saved estimate.
        print(f"Saved to {destination}")
    # Return success status to the terminal.
    return 0

# Run main only when this file is launched directly, not when imported.
if __name__ == "__main__":
    try:
        # Run the program and use its returned number as the exit status.
        raise SystemExit(main())
    # Ctrl+C or closed input cancels the program with a readable message.
    except (KeyboardInterrupt, EOFError):
        print("\nEstimate cancelled.")
        # Finish normally after the student cancels.
        raise SystemExit(0)
