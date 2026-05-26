import { layout, escHtml, flash } from "./layout.ts";
import { NUTRIENT_FIELDS, NUTRIENT_LABELS, type FoodEntry, type User } from "../db.ts";
import { toLocalInputValue, nowLocal } from "../exif.ts";

function fmt(v: number | null, decimals = 1): string {
  if (v === null) return "—";
  return v.toFixed(decimals);
}

function statusBadge(status: string): string {
  const labels: Record<string, string> = {
    no_photo: "No photo",
    pending: "AI pending",
    processing: "AI analyzing",
    done: "Done",
    failed: "AI failed",
  };
  const label = labels[status] ?? status;
  const spinner = status === "processing" ? `<span class="spinner"></span>` : "";
  return `<span class="status-badge status-${status}">${spinner}${escHtml(label)}</span>`;
}

export function foodListPage(opts: {
  user: User;
  entries: FoodEntry[];
  flash?: string;
  flashType?: "error" | "success" | "info";
}): string {
  const { user, entries } = opts;

  const rows = entries.map(e => {
    const photo = e.photo_path
      ? `<a href="/photos/${escHtml(e.photo_path)}" target="_blank" rel="noopener" class="text-muted text-sm">📷</a>`
      : `<span class="text-muted text-sm">—</span>`;

    return `<tr data-food-id="${e.id}">
      <td class="muted js-utc-datetime" data-utc="${escHtml(e.taken_at)}" style="min-width:130px">${escHtml(e.taken_at.slice(0, 16).replace("T", " "))}</td>
      <td>${photo}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${e.description ? escHtml(e.description) : `<span class="muted">—</span>`}</td>
      <td>${statusBadge(e.ollama_status)}</td>
      <td class="food-cal">${e.ollama_status === "done" || e.calories_kcal !== null ? fmt(e.calories_kcal, 0) : "—"}</td>
      <td class="food-salt">${fmt(e.salt_mg, 0)}</td>
      <td class="food-sugar">${fmt(e.sugar_g)}</td>
      <td class="food-fibre">${fmt(e.fibre_g)}</td>
      <td class="food-caffeine">${fmt(e.caffeine_mg, 0)}</td>
      <td class="food-actions" style="white-space:nowrap">
        <a href="/food/${e.id}/edit" class="btn btn-ghost btn-sm">Edit</a>
        ${e.ollama_status === "failed" && e.photo_path ? `
        <form method="POST" action="/food/${e.id}/retry-ai" style="display:inline">
          <button type="submit" class="btn btn-ghost btn-sm">Retry AI</button>
        </form>` : ""}
        <form method="POST" action="/food/${e.id}/delete" style="display:inline" onsubmit="return confirmDelete(event,'food entry')">
          <button type="submit" class="btn btn-danger btn-sm">Delete</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  return layout({
    title: "Food",
    user,
    activeTab: "food",
    fab: { href: "/food/new", label: "Log food" },
    body: `
${flash(opts.flash ?? null, opts.flashType ?? "success")}
<div class="page-header">
  <h1>Food & Drink</h1>
</div>

${entries.length === 0 ? `
<div class="card" style="text-align:center;padding:40px">
  <p class="text-muted">No entries yet. Tap the <strong style="color:var(--orange)">+</strong> button to log your first meal.</p>
</div>
` : `
<div class="table-wrap">
  <table id="food-table">
    <thead>
      <tr>
        <th>Time</th>
        <th>Photo</th>
        <th>Description</th>
        <th>Status</th>
        <th>kcal</th>
        <th>Salt mg</th>
        <th>Sugar g</th>
        <th>Fibre g</th>
        <th>Caff mg</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</div>
`}`,
  });
}

export function foodNewPage(opts: {
  user: User;
  error?: string;
  defaultTime?: string;
}): string {
  const { user } = opts;
  const defaultTime = opts.defaultTime ?? toLocalInputValue(nowLocal());

  return layout({
    title: "Log Food",
    user,
    activeTab: "food",
    body: `
<div class="page-header">
  <h1>Log Food / Drink</h1>
  <a href="/food" class="btn btn-ghost btn-sm">Cancel</a>
</div>

${flash(opts.error ?? null, "error")}

<form method="POST" action="/food" enctype="multipart/form-data" id="food-form">
  <div class="form-group">
    <label for="taken_at">Date & Time</label>
    <input type="datetime-local" id="taken_at" name="taken_at" value="${escHtml(defaultTime)}" data-default-now="1" required/>
    <p class="input-hint">Will be overridden by photo EXIF date if a photo is attached.</p>
  </div>

  <div class="form-group">
    <label>Photo <span class="text-muted text-sm">(optional — triggers AI analysis)</span></label>
    <div class="photo-input-zone" id="photo-zone">
      <input type="file" name="photo" id="photo-input" accept="image/*" capture="environment"/>
      <div class="zone-icon">📷</div>
      <div class="zone-label">Tap to take photo or <strong>drop image here</strong></div>
    </div>
    <img id="photo-preview" class="photo-preview" alt="Preview"/>
  </div>

  <div class="form-group">
    <label for="description">Notes <span class="text-muted text-sm">(optional)</span></label>
    <textarea id="description" name="description" placeholder="e.g. Chicken salad, medium portion"></textarea>
  </div>

  <button type="submit" class="btn btn-primary btn-full">Save &amp; Analyse</button>
</form>`,
  });
}

export function foodEditPage(opts: {
  user: User;
  entry: FoodEntry;
  error?: string;
  savedTemp?: string | null;
}): string {
  const { user, entry } = opts;
  const hasAi = entry.ai_calories_kcal !== null;

  const nutrientInputs = NUTRIENT_FIELDS.map(f => `
    <div class="form-group">
      <label for="${f}">${escHtml(NUTRIENT_LABELS[f])}</label>
      <input type="number" id="${f}" name="${f}" step="any" min="0"
             value="${entry[f] !== null ? entry[f] : ""}"
             placeholder="—"/>
    </div>`).join("");

  return layout({
    title: "Edit Food Entry",
    user,
    activeTab: "food",
    body: `
<div class="page-header">
  <h1>Edit Entry</h1>
  <a href="/food" class="btn btn-ghost btn-sm">Back</a>
</div>

${flash(opts.error ?? null, "error")}

${entry.photo_path ? `
<div style="margin-bottom:16px">
  <a href="/photos/${escHtml(entry.photo_path)}" target="_blank" rel="noopener">
    <img src="/photos/${escHtml(entry.photo_path)}" alt="Food photo"
         style="max-height:200px;max-width:100%;border-radius:var(--radius);object-fit:contain"/>
  </a>
</div>` : ""}

${entry.ollama_description ? `
<div class="card" style="margin-bottom:16px">
  <p class="section-title">AI Description</p>
  <p class="text-sm">${escHtml(entry.ollama_description)}</p>
  <p class="text-muted text-sm mt-8">Status: ${statusBadge(entry.ollama_status)}</p>
</div>` : `<p class="text-muted text-sm" style="margin-bottom:16px">Status: ${statusBadge(entry.ollama_status)}</p>`}

<form method="POST" action="/food/${entry.id}/edit">
  <div class="form-group">
    <label for="taken_at">Date & Time</label>
    <input type="datetime-local" id="taken_at" name="taken_at"
           value="${escHtml(toLocalInputValue(entry.taken_at))}" data-utc-value="${escHtml(entry.taken_at)}" required/>
  </div>

  <div class="form-group">
    <label for="description">Notes</label>
    <textarea id="description" name="description">${escHtml(entry.description ?? "")}</textarea>
  </div>

  <p class="section-title">Nutritional Values</p>
  <div class="nutrient-grid">
    ${nutrientInputs}
  </div>

  <div class="actions actions-split mt-16">
    <button type="submit" class="btn btn-primary">Save Changes</button>
    <div class="actions-right">
      ${hasAi ? `
      <form method="POST" action="/food/${entry.id}/revert" style="display:inline">
        <button type="submit" class="btn btn-ghost" onclick="return confirm('Revert all nutritional values to the AI estimate?')">
          Revert to AI estimate
        </button>
      </form>` : ""}
      ${entry.ollama_status === "failed" && entry.photo_path ? `
      <form method="POST" action="/food/${entry.id}/retry-ai" style="display:inline">
        <button type="submit" class="btn btn-ghost">Retry AI</button>
      </form>` : ""}
      <form method="POST" action="/food/${entry.id}/delete" style="display:inline" onsubmit="return confirmDelete(event,'food entry')">
        <button type="submit" class="btn btn-danger">Delete</button>
      </form>
    </div>
  </div>
</form>`,
  });
}
