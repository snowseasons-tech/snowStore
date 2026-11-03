## Recipe 09 Caption lab

**Build:** Count a draft against your own writing budget without sending it anywhere.

**Languages:** HTML, CSS and JavaScript. **Time:** 45–75 minutes.

### What you need

A browser and editor; index.html, caption.js and styles.css.

### Build and explore

1. Open projects/09_caption_lab/index.html locally.
2. Type hello. Expect five Unicode code points and 275 remaining in the default budget.
3. Type more than 280 ordinary letters and see the over-budget message.
4. Read countCodePoints and update. Try Clear caption and notice focus returns to the text area.

### What to expect

Live count, remaining budget and an over-budget message with text as well as color. Nothing is saved or published.

### Remix challenge and answer

Change the personal budget to 150 and test 151 plain letters. Answer: one over budget. Try an emoji sequence and explain why one visible symbol can count as several code points.

### Error handling and limits

The 280-point budget is a personal exercise value, not a claim about any platform’s current limit. Code points differ from UTF-16 units, grapheme clusters and platform-specific counting. The textarea’s generous maxlength uses UTF-16 units; our displayed counter uses code points.


Commands use the cookbook root unless stated otherwise.
