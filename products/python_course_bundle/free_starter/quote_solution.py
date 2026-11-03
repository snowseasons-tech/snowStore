# EDIT HERE: replace the text inside the quotes with a fictional business name.
# The equals sign stores a value under a name; quotes mark text.
business = "Practice Cleaning Co"
# EDIT HERE: change 3 to the number of hours for your practice job.
hours = 3
# EDIT HERE: enter a whole-dollar hourly rate without a dollar sign.
hourly_rate = 50
# Multiply hours by the rate. The asterisk (*) means multiplication.
total = hours * hourly_rate
# print() displays a value in the terminal. Parentheses hold what to display.
print(business)
# The f lets braces insert total into the text; :.2f shows two decimal places.
print(f"Labor estimate: ${total:.2f}")
