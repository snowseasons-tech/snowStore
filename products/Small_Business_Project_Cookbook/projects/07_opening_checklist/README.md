# Recipe 07 Office opening checklist

**Outcome:** Create a readable checklist with native controls and expandable instructions, without JavaScript.

**Languages:** HTML and CSS. **Time:** 30–45 minutes.

**Files:** [projects/07_opening_checklist](projects/07_opening_checklist/).

### Ingredients

Plain-text editor and browser. Files: index.html and styles.css. Keep them together.

### Method

1. Open projects/07_opening_checklist/index.html in your browser.
2. Read the HTML comments about fieldset, legend and nested labels.
3. Use Tab to focus a checkbox and Space to toggle it. Activate the details summary using keyboard and pointer.
4. Edit a label, save and refresh. This example deliberately does not promise any saved state.

### Expected result

Three labeled tasks and an expandable explanation. The page works as a local interface even without JavaScript.

### Make it your own

Add a fourth labeled checkbox for checking the entrance. Answer: place a new label/input pair inside the fieldset; no script change is required. Explain why a placeholder is not a substitute for a visible label.

### Error handling and limits

There is no completion history, shared account or reliable persistence. A browser might restore form state opportunistically, but this is not an audit record. A real operating procedure should be reviewed by the business owner.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.
