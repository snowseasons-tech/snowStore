"use strict";
// A versioned key separates this lesson's data from other local applications.
const key = "snow-seasons-cookbook-checklist-v1";
const ids = ["appointments", "customer-area", "supplies"];
const controls = ids.map(id => document.getElementById(id));
const clearButton = document.getElementById("clear-tasks");
const status = document.getElementById("storage-status");
if (controls.some(control => !control) || !clearButton || !status) {
  console.error("Missing checklist controls. Check HTML ids.");
} else {
  // localStorage can be blocked or contain malformed data. Never assume success.
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length !== controls.length ||
          !saved.every(value => typeof value === "boolean")) {
        throw new Error("Stored checklist shape is invalid.");
      }
      controls.forEach((control, index) => { control.checked = saved[index]; });
    }
    status.textContent = "Ready. Changes will be saved in this browser when storage permits.";
  } catch (error) {
    status.textContent = "Saved state could not be loaded. You can still use the checklist; changes may replace invalid saved state.";
  }
  function save() {
    try {
      // Convert booleans to JSON text. Do not store confidential customer data here.
      localStorage.setItem(key, JSON.stringify(controls.map(control => control.checked)));
      status.textContent = "Checklist saved in this browser.";
    } catch (error) {
      status.textContent = "Could not save. Your current checks work only for this page session.";
    }
  }
  controls.forEach(control => control.addEventListener("change", save));
  clearButton.addEventListener("click", function () {
    // Only this checklist changes. Never call localStorage.clear() here.
    controls.forEach(control => { control.checked = false; });
    save();
  });
}
