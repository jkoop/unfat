import { layout, escHtml, flash } from "./layout.ts";
import { toLocalInputValue, nowLocal } from "../exif.ts";
import type { WeightEntry, User } from "../db.ts";

export function weightListPage(opts: {
  user: User;
  entries: WeightEntry[];
  flash?: string;
  flashType?: "error" | "success" | "info";
}): string {
  const { user, entries } = opts;
  const unit = user.unit_user_weight;

  const rows = entries.map(e => `
    <tr>
      <td class="muted js-utc-datetime" data-utc="${escHtml(e.measured_at)}">${escHtml(e.measured_at.slice(0, 16).replace("T", " "))}</td>
      <td><strong>${e.weight.toFixed(1)}</strong> ${escHtml(unit)}</td>
      <td style="white-space:nowrap">
        <a href="/weight/${e.id}/edit" class="btn btn-ghost btn-sm">Edit</a>
        <form method="POST" action="/weight/${e.id}/delete" style="display:inline" onsubmit="return confirmDelete(event,'weight entry')">
          <button type="submit" class="btn btn-danger btn-sm">Delete</button>
        </form>
      </td>
    </tr>`).join("");

  return layout({
    title: "Weight",
    user,
    activeTab: "weight",
    fab: { href: "/weight/new", label: "Log weight" },
    body: `
${flash(opts.flash ?? null, opts.flashType ?? "success")}
<div class="page-header"><h1>Weight</h1></div>
${entries.length === 0 ? `
<div class="card" style="text-align:center;padding:40px">
  <p class="text-muted">No weight entries yet. Tap <strong style="color:var(--orange)">+</strong> to log your first.</p>
</div>` : `
<div class="table-wrap">
  <table>
    <thead>
      <tr><th>Time</th><th>Weight (${escHtml(unit)})</th><th></th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`}`,
  });
}

export function weightFormPage(opts: {
  user: User;
  entry?: WeightEntry;
  error?: string;
}): string {
  const { user, entry } = opts;
  const isEdit = !!entry;
  const now = toLocalInputValue(nowLocal());
  const timeVal = entry ? toLocalInputValue(entry.measured_at) : now;
  const weightVal = entry?.weight ?? "";
  const action = isEdit ? `/weight/${entry!.id}/edit` : "/weight";
  const unit = user.unit_user_weight;

  return layout({
    title: isEdit ? "Edit Weight" : "Log Weight",
    user,
    activeTab: "weight",
    body: `
<div class="page-header">
  <h1>${isEdit ? "Edit Weight" : "Log Weight"}</h1>
  <a href="/weight" class="btn btn-ghost btn-sm">Cancel</a>
</div>
${flash(opts.error ?? null, "error")}
<form method="POST" action="${action}">
  <div class="form-group">
    <label for="measured_at">Date & Time</label>
    <input type="datetime-local" id="measured_at" name="measured_at" value="${escHtml(timeVal)}" ${entry ? `data-utc-value="${escHtml(entry.measured_at)}"` : `data-default-now="1"`} required/>
  </div>
  <div class="form-group">
    <label for="weight">Weight (${escHtml(unit)})</label>
    <input type="number" id="weight" name="weight" step="0.1" min="0"
           value="${weightVal}" placeholder="e.g. 170.5" required/>
  </div>
  <div class="actions mt-16">
    <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Save"}</button>
  </div>
</form>
${isEdit ? `
<div class="actions mt-16">
  <form method="POST" action="/weight/${entry!.id}/delete" style="display:inline" onsubmit="return confirmDelete(event,'weight entry')">
    <button type="submit" class="btn btn-danger btn-sm">Delete</button>
  </form>
</div>` : ""}`,
  });
}
