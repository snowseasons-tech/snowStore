"use strict";
// This is a personal writing budget, not a platform's official character limit.
// Count Unicode code points. Emoji sequences can contain MORE than one code point.
function countCodePoints(text) {
  return Array.from(text).length;
}
const input = document.querySelector("#caption");
const result = document.querySelector("#caption-result");
const clear = document.querySelector("#clear-caption");
// EDIT HERE: change the personal budget; keep it a positive whole number.
const budget = 280;
if (!input || !result || !clear) {
  console.error("Missing caption controls. Check HTML ids.");
} else {
  function update() {
    const used = countCodePoints(input.value);
    const remaining = budget - used;
    // Plain text output avoids interpreting a typed caption as HTML.
    result.textContent = remaining >= 0
      ? `${used} code points; ${remaining} remaining in your ${budget}-point budget.`
      : `${used} code points; ${-remaining} over your ${budget}-point budget.`;
    result.classList.toggle("over-budget", remaining < 0);
  }
  input.addEventListener("input", update);
  clear.addEventListener("click", function () {
    input.value = "";
    update();
    input.focus();
  });
  update();
}
