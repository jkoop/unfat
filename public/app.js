(function () {
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function parseSqlUtc(sql) {
    if (!sql) return null;
    const d = new Date(String(sql).replace(" ", "T") + "Z");
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function toDatetimeLocalValue(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function formatLocalFromSqlUtc(sql) {
    const d = parseSqlUtc(sql);
    if (!d) return sql;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  // Register service worker for PWA installability.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  // Offline banner.
  const offlineBanner = document.getElementById("offline-banner");
  function updateOnlineState() {
    if (!offlineBanner) return;
    if (navigator.onLine) offlineBanner.classList.remove("visible");
    else offlineBanner.classList.add("visible");
  }
  window.addEventListener("online", updateOnlineState);
  window.addEventListener("offline", updateOnlineState);
  updateOnlineState();

  // Global helpers.
  window.confirmDelete = function confirmDelete(_ev, what) {
    return window.confirm(`Delete this ${what}? This cannot be undone.`);
  };

  // Add timezone offset to all forms so server can store UTC correctly.
  document.querySelectorAll("form").forEach((form) => {
    if (form.querySelector('input[name="tz_offset_min"]')) return;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "tz_offset_min";
    input.value = String(new Date().getTimezoneOffset());
    form.appendChild(input);
  });

  // Datetime-local inputs should use browser local time.
  document.querySelectorAll('input[type="datetime-local"]').forEach((input) => {
    const utcVal = input.dataset.utcValue;
    if (utcVal) {
      const dt = parseSqlUtc(utcVal);
      if (dt) input.value = toDatetimeLocalValue(dt);
      return;
    }
    if (input.dataset.defaultNow === "1") {
      input.value = toDatetimeLocalValue(new Date());
      return;
    }
    if (!input.value) {
      input.value = toDatetimeLocalValue(new Date());
    }
  });

  // Render SQL UTC datetime strings using browser timezone.
  document.querySelectorAll(".js-utc-datetime[data-utc]").forEach((el) => {
    const utc = el.dataset.utc;
    if (!utc) return;
    el.textContent = formatLocalFromSqlUtc(utc);
  });

  function showToast(message, type) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const el = document.createElement("div");
    el.className = `toast toast-${type || "info"}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(20px)";
      setTimeout(() => el.remove(), 150);
    }, 3500);
  }
  window.showToast = showToast;

  // Food form image preview + drag/drop.
  const photoInput = document.getElementById("photo-input");
  const photoPreview = document.getElementById("photo-preview");
  const photoZone = document.getElementById("photo-zone");
  if (photoInput && photoPreview) {
    const renderPreview = () => {
      const f = photoInput.files && photoInput.files[0];
      if (!f) {
        photoPreview.style.display = "none";
        photoPreview.src = "";
        return;
      }
      const url = URL.createObjectURL(f);
      photoPreview.src = url;
      photoPreview.style.display = "block";
    };
    photoInput.addEventListener("change", renderPreview);

    if (photoZone) {
      ["dragenter", "dragover"].forEach((evt) => {
        photoZone.addEventListener(evt, (e) => {
          e.preventDefault();
          photoZone.classList.add("drag-over");
        });
      });
      ["dragleave", "drop"].forEach((evt) => {
        photoZone.addEventListener(evt, (e) => {
          e.preventDefault();
          photoZone.classList.remove("drag-over");
        });
      });
      photoZone.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        if (!dt || !dt.files || !dt.files.length) return;
        photoInput.files = dt.files;
        renderPreview();
      });
    }
  }

  // SSE live updates for food table.
  const foodTable = document.getElementById("food-table");
  if (foodTable && window.EventSource) {
    const es = new EventSource("/sse");
    es.onmessage = (ev) => {
      if (!ev.data) return;
      try {
        const payload = JSON.parse(ev.data);
        if (payload.type === "food_updated" && payload.entry) {
          updateFoodRow(payload.entry);
        } else if (payload.type === "toast" && payload.message) {
          showToast(payload.message, payload.level || "info");
        }
      } catch {
        // Ignore malformed message.
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; no-op.
    };
  }

  function fmt(v, decimals) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
    return Number(v).toFixed(decimals);
  }

  function statusBadge(status) {
    const labels = {
      no_photo: "No photo",
      pending: "AI pending",
      processing: "AI analyzing",
      done: "Done",
      failed: "AI failed",
    };
    const spinner = status === "processing" ? '<span class="spinner"></span>' : "";
    return `<span class="status-badge status-${status}">${spinner}${labels[status] || status}</span>`;
  }

  function updateFoodRow(entry) {
    const row = document.querySelector(`tr[data-food-id="${entry.id}"]`);
    if (!row) return;
    const statusCell = row.children[3];
    if (statusCell) statusCell.innerHTML = statusBadge(entry.ollama_status);
    const timeCell = row.querySelector(".js-utc-datetime[data-utc]");
    if (timeCell && entry.taken_at) {
      timeCell.dataset.utc = entry.taken_at;
      timeCell.textContent = formatLocalFromSqlUtc(entry.taken_at);
    }

    const map = [
      [".food-cal", entry.calories_kcal, 0],
      [".food-salt", entry.salt_mg, 0],
      [".food-sugar", entry.sugar_g, 1],
      [".food-fibre", entry.fibre_g, 1],
      [".food-caffeine", entry.caffeine_mg, 0],
    ];
    map.forEach(([sel, val, decimals]) => {
      const cell = row.querySelector(sel);
      if (!cell) return;
      cell.textContent = fmt(val, decimals);
    });

    const actionsCell = row.querySelector(".food-actions");
    if (actionsCell) {
      const retryBtn =
        entry.ollama_status === "failed" && entry.photo_path
          ? `<form method="POST" action="/food/${entry.id}/retry-ai" style="display:inline">
               <button type="submit" class="btn btn-ghost btn-sm">Retry AI</button>
             </form>`
          : "";
      actionsCell.innerHTML = `
        <a href="/food/${entry.id}/edit" class="btn btn-ghost btn-sm">Edit</a>
        ${retryBtn}
        <form method="POST" action="/food/${entry.id}/delete" style="display:inline" onsubmit="return confirmDelete(event,'food entry')">
          <button type="submit" class="btn btn-danger btn-sm">Delete</button>
        </form>
      `;
    }

    showToast("Food entry updated from AI", entry.ollama_status === "failed" ? "error" : "success");
  }
})();
