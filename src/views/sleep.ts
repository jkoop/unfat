import { layout, escHtml, flash } from "./layout.ts";
import { toLocalInputValue, nowLocal } from "../exif.ts";
import type { SleepEntry, User } from "../db.ts";

function scoreDots(score: number | null): string {
  if (score === null) return `<span class="muted">—</span>`;
  const dots = Array.from({ length: 10 }, (_, i) =>
    `<span class="score-dot${i < score ? " filled" : ""}"></span>`
  ).join("");
  return `<span class="score-display" title="${score}/10">${dots} ${score}</span>`;
}

function durationStr(start: string, end: string): string {
  const s = new Date(start.replace(" ", "T"));
  const e = new Date(end.replace(" ", "T"));
  const diff = (e.getTime() - s.getTime()) / 1000 / 60;
  if (isNaN(diff) || diff <= 0) return "—";
  const h = Math.floor(diff / 60);
  const m = Math.round(diff % 60);
  return `${h}h ${m}m`;
}

export function sleepListPage(opts: {
  user: User;
  entries: SleepEntry[];
  flash?: string;
  flashType?: "error" | "success" | "info";
}): string {
  const { user, entries } = opts;

  const rows = entries.map(e => `
    <tr>
      <td class="muted js-utc-datetime" data-utc="${escHtml(e.start_time)}">${escHtml(e.start_time.slice(0, 16).replace("T", " "))}</td>
      <td class="muted js-utc-datetime" data-utc="${escHtml(e.end_time)}">${escHtml(e.end_time.slice(0, 16).replace("T", " "))}</td>
      <td>${durationStr(e.start_time, e.end_time)}</td>
      <td>${scoreDots(e.score)}</td>
      <td style="white-space:nowrap">
        <a href="/sleep/${e.id}/edit" class="btn btn-ghost btn-sm">Edit</a>
        <form method="POST" action="/sleep/${e.id}/delete" style="display:inline" onsubmit="return confirmDelete(event,'sleep entry')">
          <button type="submit" class="btn btn-danger btn-sm">Delete</button>
        </form>
      </td>
    </tr>`).join("");

  return layout({
    title: "Sleep",
    user,
    activeTab: "sleep",
    fab: { href: "/sleep/new", label: "Log sleep" },
    body: `
${flash(opts.flash ?? null, opts.flashType ?? "success")}
<div class="page-header"><h1>Sleep</h1></div>
${entries.length === 0 ? `
<div class="card" style="text-align:center;padding:40px">
  <p class="text-muted">No sleep entries yet. Tap <strong style="color:var(--orange)">+</strong> to log your first.</p>
</div>` : `
<div class="table-wrap">
  <table>
    <thead>
      <tr><th>Start</th><th>End</th><th>Duration</th><th>Score</th><th></th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`}`,
  });
}

export function sleepFormPage(opts: {
  user: User;
  entry?: SleepEntry;
  error?: string;
}): string {
  const { user, entry } = opts;
  const isEdit = !!entry;
  const now = toLocalInputValue(nowLocal());
  const startVal = entry ? toLocalInputValue(entry.start_time) : now;
  const endVal = entry ? toLocalInputValue(entry.end_time) : now;
  const scoreVal = entry?.score ?? 7;
  const action = isEdit ? `/sleep/${entry!.id}/edit` : "/sleep";

  return layout({
    title: isEdit ? "Edit Sleep" : "Log Sleep",
    user,
    activeTab: "sleep",
    body: `
<div class="page-header">
  <h1>${isEdit ? "Edit Sleep" : "Log Sleep"}</h1>
  <a href="/sleep" class="btn btn-ghost btn-sm">Cancel</a>
</div>
${flash(opts.error ?? null, "error")}
<form method="POST" action="${action}">
  <div class="form-group">
    <label for="start_time">Fell Asleep</label>
    <input type="datetime-local" id="start_time" name="start_time" value="${escHtml(startVal)}" ${entry ? `data-utc-value="${escHtml(entry.start_time)}"` : `data-default-now="1"`} required/>
  </div>
  <div class="form-group">
    <label for="end_time">Woke Up</label>
    <input type="datetime-local" id="end_time" name="end_time" value="${escHtml(endVal)}" ${entry ? `data-utc-value="${escHtml(entry.end_time)}"` : `data-default-now="1"`} required/>
  </div>
  <div class="form-group">
    <label for="score">Sleep Quality: <span id="score-display">${scoreVal}</span>/10</label>
    <input type="range" id="score" name="score" min="1" max="10" value="${scoreVal}"
           oninput="document.getElementById('score-display').textContent=this.value"/>
  </div>
  <div class="actions mt-16">
    <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Save"}</button>
  </div>
</form>
${isEdit ? `
<div class="actions mt-16">
  <form method="POST" action="/sleep/${entry!.id}/delete" style="display:inline" onsubmit="return confirmDelete(event,'sleep entry')">
    <button type="submit" class="btn btn-danger btn-sm">Delete</button>
  </form>
</div>` : ""}`,
  });
}
