# Build your first service quote calculator
## Your goal
Calculate the labor cost of a fictional three-hour job at $50 per hour. You will learn how to run a Python file, store values and display a result. You do not need to understand every symbol before running it.

## 1 Set up Python
Get Python 3 from https://www.python.org/downloads/ and follow the official instructions for your operating system. On Linux, use your distribution's Python 3 installation instructions if Python is missing. Do not replace the operating system's Python.

Open a terminal: PowerShell on Windows, Terminal on macOS, or your Linux terminal. A terminal is a window where you type commands and press Enter.

Check the installation:
- Windows: `py -3 --version`
- macOS or Linux: `python3 --version`

You should see Python 3.11 or later. If the command is missing, finish the official installation instructions, close and reopen the terminal, then check again.

## 2 Open the lesson folder
Extract the ZIP. In your terminal type `cd `, followed by the path to the free_starter folder in quotes, then press Enter. For example, if you extracted to Documents on Windows: `cd "$HOME\Documents\course_bundle\free_starter"`. Replace that example with your actual folder location. On macOS or Linux, an example is `cd "$HOME/Documents/course_bundle/free_starter"`.

Run the completed example:
- Windows: `py -3 quote_solution.py`
- macOS or Linux: `python3 quote_solution.py`

Expected output:
```
Practice Cleaning Co
Labor estimate: $150.00
```

## 3 Read the code
Open quote_starter.py in a plain-text editor. Avoid a word processor, which can add formatting that Python cannot read.

`business = "Practice Cleaning Co"` gives a name to a piece of text. The quotes mark text; they are not printed.

`hours = 3` and `hourly_rate = 50` store whole numbers. A single equals sign assigns a value to a name. Python processes these lines from top to bottom.

`total = hours * hourly_rate` multiplies the two numbers. The asterisk means multiplication. Whole dollars keep this first example simple; the paid pack introduces decimal money.

`print(business)` displays the stored name. In `print(f"Labor estimate: ${total:.2f}")`, the f lets Python insert a value between braces. The dollar sign is ordinary text. The `:.2f` displays two decimal places.

## 4 Make your first change
In quote_starter.py replace the business name with a fictional business. Change hours to 4 and hourly_rate to 60. Save the file. Run quote_starter.py with the same command pattern as above. You should see $240.00.

## 5 Practice
A. Predict the result for 2 hours at $75 before running it.
B. Add `print("Estimate only")` as the last line.
C. Change the hours back to 3. Explain which line calculates the total.

## Answers
A. $150.00. B. The new message appears after the total. C. `total = hours * hourly_rate` recalculates the result using the current values.

## Common problems
- File not found: confirm you extracted the ZIP and opened the free_starter folder. Use `dir` on Windows or `ls` on macOS/Linux to list files.
- SyntaxError: check for missing straight quotes or parentheses. Copy the original line and try again.
- NameError: names must match exactly, including capitalization. `hours` and `Hours` differ.
- Nothing changed: save your file and confirm you ran quote_starter.py rather than quote_solution.py.
- A `>>>` prompt: you opened Python's interactive shell. Enter `exit()` and run the command in your terminal.

## Check your understanding
Can you change the rate without changing the calculation? Can you explain what * does? Can you predict the output before running it? If yes, continue to the paid pack. Keep your edited starter as evidence of your first working program.
