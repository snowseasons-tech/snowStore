const $ = (id) => document.getElementById(id);
const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function api(path, opts = {}) {
  const response = await fetch("/api" + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "PodcastStudio",
      ...(opts.headers || {}),
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) {
      $("workspace").hidden = true;
      $("login").hidden = false;
    }
    throw Error(
      Array.isArray(err.detail)
        ? err.detail.map((x) => x.msg).join("; ")
        : err.detail || `HTTP ${response.status}`,
    );
  }
  return response.json();
}
function message(text, good = false) {
  $("notice").textContent = text;
  $("notice").className = good ? "success" : "error";
}
async function refresh() {
  try {
    const [stats, episodes, clips, metrics] = await Promise.all([
      api("/dashboard"),
      allPages("/episodes"),
      allPages("/clips"),
      api("/metrics"),
    ]);
    $("metrics").innerHTML = Object.entries({
      Episodes: stats.episodes,
      Clips: stats.clips,
      Review: stats.awaiting_review,
      Approved: stats.approved,
      Scheduled: stats.scheduled,
      Published: stats.published,
    })
      .map(
        ([k, v]) =>
          `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`,
      )
      .join("");
    const selectedEpisode = $("episodeSelect").value;
    window.currentEpisodes = episodes;
    $("episodeSelect").innerHTML =
      '<option value="">Select episode</option>' +
      episodes
        .map((e) => `<option value="${e.id}">${escapeHtml(e.title)}</option>`)
        .join("");
    $("episodeSelect").value = selectedEpisode;
    $("episodes").innerHTML =
      episodes
        .map(
          (e) =>
            `<div class="item"><strong>${escapeHtml(e.title)}</strong><p>${escapeHtml(e.description.slice(0, 250))}</p><button class="secondary" data-edit-episode="${e.id}">Edit episode</button></div>`,
        )
        .join("") || "<p>No episodes yet.</p>";
    window.currentClips = clips;
    $("clips").innerHTML =
      clips
        .filter(
          (c) =>
            !$("statusFilter").value || c.status === $("statusFilter").value,
        )
        .map((c) => {
          const next = {
            draft: "review",
            review: "approved",
            approved: "scheduled",
            scheduled: "published",
          }[c.status];
          return `<div class="item"><div><strong>${escapeHtml(c.hook)}</strong><span class="pill">${escapeHtml(c.status)}</span><span class="pill">${escapeHtml(c.platform)}</span></div><p>${escapeHtml(c.caption)}</p><small>Episode #${c.episode_id}${c.scheduled_for ? " · Scheduled " + escapeHtml(new Date(c.scheduled_for).toLocaleString()) : ""}</small><div class="row" style="margin-top:10px">${next ? `<button class="secondary" data-advance="${c.id}">Move to ${next}</button>` : ""}${["draft", "review"].includes(c.status) ? `<button class="secondary" data-edit="${c.id}">Edit draft</button><button class="secondary" data-delete="${c.id}">Delete</button>` : ""}${["approved", "scheduled"].includes(c.status) ? `<button class="secondary" data-back="${c.id}">${c.status === "scheduled" ? "Cancel schedule" : "Return to draft"}</button>` : ""}${c.status === "review" ? `<button class="secondary" data-back="${c.id}">Request edits</button>` : ""}</div></div>`;
        })
        .join("") || "<p>No clips planned yet.</p>";
    $("metricsList").innerHTML =
      metrics
        .slice(0, 12)
        .map(
          (m) =>
            `<div class="item"><strong>${escapeHtml(m.platform)}</strong> · ${escapeHtml(m.recorded_on)}<p>${m.plays} plays · ${m.followers} followers · ${m.engagement} engagements</p><button class="secondary" data-delete-metric="${m.id}">Remove snapshot</button></div>`,
        )
        .join("") || "<p>No snapshots recorded.</p>";
    const events = await api("/audit");
    $("activity").innerHTML =
      events
        .slice(0, 15)
        .map(
          (e) =>
            `<div class="item">${escapeHtml(e.action)} ${e.entity_id ? "#" + e.entity_id : ""}<small> · ${escapeHtml(new Date(/[Z+]/.test(e.created_at.slice(10)) ? e.created_at : e.created_at + "Z").toLocaleString())}</small></div>`,
        )
        .join("") || "<p>No activity yet.</p>";
  } catch (e) {
    message(e.message);
  }
}
async function submit(form, route, transform) {
  if (form.dataset.busy) return;
  form.dataset.busy = "1";
  const button = form.querySelector("button[type=submit],button:not([type])");
  if (button) button.disabled = true;
  const payload = Object.fromEntries(new FormData(form));
  try {
    await api(route, {
      method: form.dataset.editId ? "PUT" : "POST",
      body: JSON.stringify(transform ? transform(payload) : payload),
    });
    form.reset();
    delete form.dataset.editId;
    const cancel = form.querySelector("[data-cancel]");
    if (cancel) cancel.hidden = true;
    $("metricForm").elements.recorded_on.value = localDate();
    message("Saved successfully", true);
    await refresh();
  } catch (e) {
    message(e.message);
  } finally {
    delete form.dataset.busy;
    if (button) button.disabled = false;
  }
}
$("episodeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  submit(
    e.target,
    e.target.dataset.editId
      ? `/episodes/${e.target.dataset.editId}`
      : "/episodes",
    (p) => ({ ...p, published_on: p.published_on || null }),
  );
});
$("clipForm").addEventListener("submit", (e) => {
  e.preventDefault();
  submit(
    e.target,
    e.target.dataset.editId
      ? `/clips/${e.target.dataset.editId}/content`
      : "/clips",
    (p) => ({ ...p, episode_id: Number(p.episode_id) }),
  );
});
$("metricForm").addEventListener("submit", (e) => {
  e.preventDefault();
  submit(e.target, "/metrics", (p) => ({
    ...p,
    plays: Number(p.plays),
    followers: Number(p.followers),
    engagement: Number(p.engagement),
  }));
});
$("ideaButton").addEventListener("click", async () => {
  const f = $("clipForm");
  if (!f.elements.episode_id.value) {
    message("Choose an episode first");
    return;
  }
  try {
    const idea = await api("/ideas", {
      method: "POST",
      body: JSON.stringify({
        episode_id: Number(f.elements.episode_id.value),
        platform: f.elements.platform.value,
      }),
    });
    f.elements.hook.value = idea.hook;
    f.elements.caption.value = idea.caption;
    message(
      idea.warning ||
        `Draft suggestion generated using ${idea.source}; review before use`,
      true,
    );
  } catch (e) {
    message(e.message);
  }
});
$("clips").addEventListener("click", async (e) => {
  const id = e.target.dataset.advance || e.target.dataset.back;
  if (!id) return;
  const clip = window.currentClips.find((c) => c.id === Number(id));
  const status = e.target.dataset.back
    ? clip.status === "scheduled"
      ? "approved"
      : "draft"
    : {
        draft: "review",
        review: "approved",
        approved: "scheduled",
        scheduled: "published",
      }[clip.status];
  let scheduled_for = null;
  if (status === "scheduled") {
    $("scheduleDialog").dataset.clipId = id;
    $("scheduleTime").value = "";
    $("scheduleError").textContent = "";
    $("scheduleDialog").showModal();
    return;
  }
  if (
    status === "published" &&
    !confirm("Confirm this clip was actually posted externally?")
  )
    return;
  try {
    await api(`/clips/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, scheduled_for }),
    });
    message("Status updated", true);
    await refresh();
  } catch (err) {
    message(err.message);
  }
});
$("metricForm").elements.recorded_on.value = localDate();
async function allPages(route) {
  let rows = [],
    offset = 0;
  while (true) {
    const page = await api(`${route}?offset=${offset}&limit=500`);
    rows.push(...page);
    if (page.length < 500) return rows;
    offset += 500;
  }
}
function localDate() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.target.querySelector("button");
  button.disabled = true;
  try {
    await api("/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    e.target.reset();
    $("loginError").textContent = "";
    $("login").hidden = true;
    $("workspace").hidden = false;
    await refresh();
  } catch (err) {
    $("loginError").textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
$("logoutButton").onclick = async () => {
  try {
    await api("/logout", { method: "POST" });
    location.reload();
  } catch (e) {
    message(e.message);
  }
};
$("statusFilter").onchange = refresh;
$("episodes").onclick = (e) => {
  const id = e.target.dataset.editEpisode;
  if (!id) return;
  const episode = window.currentEpisodes.find((x) => x.id === +id);
  const f = $("episodeForm");
  for (const key of ["title", "description", "source_url", "published_on"])
    f.elements[key].value = episode[key] || "";
  f.dataset.editId = id;
  f.querySelector("[data-cancel]").hidden = false;
  f.scrollIntoView({ behavior: "smooth" });
  message("Editing episode. Save to apply changes.", true);
};
$("clips").addEventListener("click", async (e) => {
  const id = e.target.dataset.edit || e.target.dataset.delete;
  if (!id) return;
  const clip = window.currentClips.find((x) => x.id === +id);
  if (e.target.dataset.edit) {
    const f = $("clipForm");
    for (const key of [
      "episode_id",
      "platform",
      "hook",
      "caption",
      "asset_url",
    ])
      f.elements[key].value = clip[key];
    f.dataset.editId = id;
    f.querySelector("[data-cancel]").hidden = false;
    f.scrollIntoView({ behavior: "smooth" });
    message("Editing draft. Saving returns it to draft for review.", true);
  } else if (confirm("Delete this draft permanently?")) {
    try {
      await api(`/clips/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      message(err.message);
    }
  }
});
$("metricsList").onclick = async (e) => {
  const id = e.target.dataset.deleteMetric;
  if (!id || !confirm("Remove this incorrect snapshot?")) return;
  try {
    await api(`/metrics/${id}`, { method: "DELETE" });
    await refresh();
  } catch (err) {
    message(err.message);
  }
};
(async () => {
  try {
    await api("/me");
    $("workspace").hidden = false;
    await refresh();
  } catch (e) {
    $("login").hidden = false;
  }
})();

for (const button of document.querySelectorAll("[data-cancel]"))
  button.onclick = () => {
    const form = $(button.dataset.cancel);
    form.reset();
    delete form.dataset.editId;
    button.hidden = true;
    message("Editing cancelled", true);
  };
$("cancelSchedule").onclick = () => $("scheduleDialog").close();
$("scheduleForm").onsubmit = async (e) => {
  e.preventDefault();
  const button = e.target.querySelector("button");
  button.disabled = true;
  try {
    const date = new Date($("scheduleTime").value);
    if (Number.isNaN(date.getTime()) || date <= new Date())
      throw Error("Choose a future date and time");
    await api(`/clips/${$("scheduleDialog").dataset.clipId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "scheduled",
        scheduled_for: date.toISOString(),
      }),
    });
    $("scheduleDialog").close();
    message("Schedule saved. Post externally at the planned time.", true);
    await refresh();
  } catch (err) {
    $("scheduleError").textContent = err.message;
  } finally {
    button.disabled = false;
  }
};
