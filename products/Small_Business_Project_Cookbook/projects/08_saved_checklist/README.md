# Recipe 08 Saved daily checklist

**Outcome:** Persist three checkbox states in the browser with schema checks and readable storage-error messages.

**Languages:** HTML, CSS and JavaScript. **Time:** 60–90 minutes.

**Files:** [projects/08_saved_checklist](projects/08_saved_checklist/).

### Ingredients

Browser and editor. Python 3 is useful for a predictable local origin. Files: index.html, styles.css and checklist.js.

### Method

1. From the cookbook root start a loopback-only development server: `python3 -m http.server 8080 --bind 127.0.0.1 --directory projects/08_saved_checklist`. Windows uses py -3 instead of python3.
2. Open http://127.0.0.1:8080/ and check a task. Refresh at the same address. If storage is available, the check remains.
3. Read the try/catch blocks, versioned storage key and JSON shape validation in checklist.js.
4. Clear completed tasks using the button. Stop the terminal server with Ctrl+C when finished.

### Expected result

With available storage, changes report Checklist saved in this browser and survive refresh at the same origin. If storage is blocked, a readable message explains that only the current page session works.

### Make it your own

Add another task only after updating ids and deciding how to migrate or version stored data. Answer: changing the array length makes old saved arrays incompatible; use a new versioned key or a deliberate migration. Explain why this recipe does not call localStorage.clear().

### Error handling and limits

Local file URL storage behavior varies, so use the loopback server for the exercise. Changing hostname, protocol or port changes the storage origin. Browser clearing, private browsing or blocked storage may lose data. This is not a shared audit trail, encrypted vault or backup.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.
