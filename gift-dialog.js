/* "Give as a gift" dialog, shared by the homepage and products page.
   Any element with data-gift="<product id>" (and data-name="<product name>") opens it.
   Submitting posts the gift details to /api/checkout and goes to Stripe. The buyer's email is collected by Stripe. */
(function () {
  var MAX_MESSAGE = 500;
  var dialog = null;
  var form, productLabel, status, submit, messageCount;
  var current = { id: "", name: "" };

  var STYLE = [
    "#gift-dialog{margin:auto;border:1px solid var(--b1,#c9d6e5);border-radius:14px;padding:0;max-width:min(480px,calc(100vw - 32px));width:100%;background:var(--bg,#fff);color:var(--text,#101e39);box-shadow:0 20px 50px rgba(0,0,0,.3)}",
    "#gift-dialog::backdrop{background:rgba(0,0,0,.45)}",
    "#gift-dialog form{padding:24px;display:grid;gap:6px}",
    "#gift-dialog h2{margin:0;font-size:1.35rem}",
    "#gift-dialog .gd-lead{margin:0 0 6px;color:var(--muted,#4a5568);font-size:.95rem}",
    "#gift-dialog label{font-weight:600;margin-top:10px;font-size:.95rem}",
    "#gift-dialog input,#gift-dialog textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--b1,#c9d6e5);border-radius:10px;background:var(--sec,#f4f7fb);color:var(--text,#101e39);font:inherit}",
    "#gift-dialog textarea{min-height:88px;resize:vertical}",
    "#gift-dialog .gd-count{font-size:.8rem;color:var(--muted,#4a5568);text-align:right}",
    "#gift-dialog .gd-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}",
    "#gift-dialog .gd-status{min-height:1.4em;color:#b42318;font-size:.95rem;margin-top:8px}",
    "#gift-dialog button{font:inherit;font-weight:600;border-radius:10px;padding:10px 16px;cursor:pointer;border:1px solid transparent}",
    "#gift-dialog .gd-go{background:var(--btn,#1f4e79);color:#fff}",
    "#gift-dialog .gd-cancel{background:transparent;color:var(--primary,#1f4e79);border-color:var(--primary,#1f4e79)}",
    "#gift-dialog button:disabled{opacity:.6;cursor:default}",
    "#gift-dialog :focus-visible{outline:3px solid var(--primary,#1f4e79);outline-offset:2px}"
  ].join("");

  function build() {
    var style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    dialog = document.createElement("dialog");
    dialog.id = "gift-dialog";
    dialog.setAttribute("aria-labelledby", "gd-title");

    form = document.createElement("form");
    form.noValidate = true;
    form.innerHTML =
      '<h2 id="gd-title">Give as a gift</h2>' +
      '<p class="gd-lead" id="gd-product"></p>' +
      '<label for="gd-name">Your name</label>' +
      '<input id="gd-name" name="buyerName" maxlength="100" autocomplete="name" required>' +
      '<label for="gd-recipient">Recipient’s email</label>' +
      '<input id="gd-recipient" name="recipientEmail" type="email" maxlength="254" autocomplete="off" required>' +
      '<label for="gd-message">Message (optional)</label>' +
      '<textarea id="gd-message" name="message" maxlength="' + MAX_MESSAGE + '"></textarea>' +
      '<div class="gd-count" id="gd-count" aria-live="polite">0 / ' + MAX_MESSAGE + '</div>' +
      '<p class="gd-lead">We email the code to the recipient and a copy to you after payment. You’ll enter your email at checkout.</p>' +
      '<p class="gd-status" id="gd-status" role="alert"></p>' +
      '<div class="gd-actions">' +
      '<button type="button" class="gd-cancel" id="gd-cancel">Cancel</button>' +
      '<button type="submit" class="gd-go" id="gd-go">Continue to payment</button>' +
      '</div>';

    dialog.appendChild(form);
    document.body.appendChild(dialog);

    productLabel = document.getElementById("gd-product");
    status = document.getElementById("gd-status");
    submit = document.getElementById("gd-go");
    messageCount = document.getElementById("gd-count");

    document.getElementById("gd-cancel").addEventListener("click", function () { dialog.close(); });
    document.getElementById("gd-message").addEventListener("input", function (e) {
      messageCount.textContent = e.target.value.length + " / " + MAX_MESSAGE;
    });
    form.addEventListener("submit", onSubmit);
    dialog.addEventListener("close", function () { setBusy(false); });
  }

  function setBusy(busy) {
    submit.disabled = busy;
    submit.textContent = busy ? "Opening payment…" : "Continue to payment";
  }

  function fail(text) {
    status.textContent = text;
    setBusy(false);
  }

  function onSubmit(e) {
    e.preventDefault();
    var name = document.getElementById("gd-name").value.trim();
    var recipient = document.getElementById("gd-recipient").value.trim();
    var message = document.getElementById("gd-message").value.trim();
    status.textContent = "";
    if (!name) return fail("Enter your name.");
    if (!recipient || recipient.indexOf("@") < 1) return fail("Enter the recipient’s email address.");
    if (message.length > MAX_MESSAGE) return fail("Keep the message to " + MAX_MESSAGE + " characters.");
    setBusy(true);
    fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: current.id,
        gift: { buyerName: name, recipientEmail: recipient, message: message }
      })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (res) {
      if (res.data && res.data.url) { location.href = res.data.url; return; }
      fail(res.data && res.data.error ? res.data.error : "Checkout could not start. Please try again.");
    }).catch(function () {
      fail("Checkout could not start. Check your connection and try again.");
    });
  }

  function open(id, name) {
    if (!dialog) build();
    current = { id: id, name: name || id };
    productLabel.textContent = "Gift: " + current.name;
    form.reset();
    messageCount.textContent = "0 / " + MAX_MESSAGE;
    status.textContent = "";
    setBusy(false);
    dialog.showModal();
    document.getElementById("gd-name").focus();
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-gift]");
    if (!b) return;
    e.preventDefault();
    open(b.getAttribute("data-gift"), b.getAttribute("data-name"));
  });

  window.SnowGift = { open: open };
})();
