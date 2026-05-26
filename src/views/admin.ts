import { layout, escHtml, flash } from "./layout.ts";
import type { User } from "../db.ts";

type AdminUserRow = {
  id: number;
  username: string;
  is_admin: number;
  is_disabled: number;
  created_at: string;
};

export function adminPage(opts: {
  user: User;
  users: AdminUserRow[];
  ollamaUrl: string;
  ollamaModel: string;
  flashMessage?: string;
  flashType?: "error" | "success" | "info";
  tempPassword?: string;
}): string {
  const usersRows = opts.users.map((u) => {
    const status = u.is_disabled ? "Disabled" : "Active";
    return `
    <tr>
      <td>${escHtml(u.username)} ${u.is_admin ? "<span class=\"text-muted\">(admin)</span>" : ""}</td>
      <td>${status}</td>
      <td class="muted js-utc-datetime" data-utc="${escHtml(u.created_at)}">${escHtml(u.created_at.slice(0, 16).replace("T", " "))}</td>
      <td style="white-space:nowrap">
        ${
          u.id !== opts.user.id
            ? `<form method="POST" action="/admin/users/${u.id}/reset-password" style="display:inline">
                <button type="submit" class="btn btn-ghost btn-sm">Reset Password</button>
               </form>
               ${
                 u.is_disabled
                   ? `<form method="POST" action="/admin/users/${u.id}/enable" style="display:inline">
                        <button type="submit" class="btn btn-ghost btn-sm">Enable</button>
                      </form>`
                   : `<form method="POST" action="/admin/users/${u.id}/disable" style="display:inline">
                        <button type="submit" class="btn btn-ghost btn-sm">Disable</button>
                      </form>`
               }
               <form method="POST" action="/admin/users/${u.id}/delete" style="display:inline" onsubmit="return confirmDelete(event,'user and all related data')">
                 <button type="submit" class="btn btn-danger btn-sm">Delete</button>
               </form>`
            : `<span class="text-muted text-sm">Current user</span>`
        }
      </td>
    </tr>`;
  }).join("");

  return layout({
    title: "Admin",
    user: opts.user,
    activeTab: "none",
    body: `
<div class="page-header"><h1>Admin Dashboard</h1></div>
${flash(opts.flashMessage ?? null, opts.flashType ?? "success")}
${opts.tempPassword ? `<div class="alert alert-info"><strong>Temporary password:</strong> <code>${escHtml(opts.tempPassword)}</code> (shown once)</div>` : ""}

<div class="admin-section">
  <h2>Create User</h2>
  <div class="card">
    <form method="POST" action="/admin/users/create">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" required autocomplete="off"/>
      </div>
      <div class="form-group">
        <label for="password">Initial Password</label>
        <input type="password" id="password" name="password" required autocomplete="off"/>
      </div>
      <button type="submit" class="btn btn-primary">Create User</button>
    </form>
  </div>
</div>

<div class="admin-section">
  <h2>Users</h2>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Status</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${usersRows}</tbody>
    </table>
  </div>
</div>

<div class="admin-section">
  <h2>Ollama Settings</h2>
  <div class="card">
    <form method="POST" action="/admin/settings">
      <div class="form-group">
        <label for="ollama_url">Ollama URL</label>
        <input type="text" id="ollama_url" name="ollama_url" value="${escHtml(opts.ollamaUrl)}" required/>
      </div>
      <div class="form-group">
        <label for="ollama_model">Ollama Model</label>
        <input type="text" id="ollama_model" name="ollama_model" value="${escHtml(opts.ollamaModel)}" required/>
      </div>
      <button type="submit" class="btn btn-primary">Save Settings</button>
    </form>
  </div>
</div>`,
  });
}
