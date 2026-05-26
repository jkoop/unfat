import type { User } from "../db.ts";

type NavTab = "food" | "sleep" | "weight" | "charts" | "none";

export function layout(opts: {
  title: string;
  body: string;
  user: User;
  activeTab?: NavTab;
  fab?: { href: string; label: string };
  scripts?: string;
}): string {
  const { title, body, user, activeTab = "none", fab, scripts = "" } = opts;

  const navItems: { id: NavTab; label: string; href: string; icon: string }[] = [
    {
      id: "food", label: "Food", href: "/food",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    },
    {
      id: "sleep", label: "Sleep", href: "/sleep",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
    },
    {
      id: "weight", label: "Weight", href: "/weight",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    },
    {
      id: "charts", label: "Charts", href: "/charts",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <meta name="theme-color" content="#f97316"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
  <link rel="manifest" href="/manifest.json"/>
  <link rel="stylesheet" href="/app.css"/>
  <title>${escHtml(title)} · Unfat</title>
</head>
<body>
<div class="app-shell">
  <header class="top-bar">
    <span class="top-bar__logo">Un<span>fat</span></span>
    <div class="top-bar__actions">
      ${user.is_admin ? `<a href="/admin" class="icon-btn" title="Admin" aria-label="Admin dashboard">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      </a>` : ""}
      <a href="/settings" class="icon-btn" title="Settings" aria-label="Settings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </a>
      <form method="POST" action="/logout" style="margin:0">
        <button class="icon-btn" type="submit" title="Logout" aria-label="Logout">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </form>
    </div>
  </header>

  <main class="page-content">
    ${body}
  </main>

  ${fab ? `<a href="${fab.href}" class="fab" aria-label="${escHtml(fab.label)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  </a>` : ""}

  <nav class="bottom-nav" aria-label="Main navigation">
    ${navItems.map(n => `
    <a href="${n.href}" class="nav-item${activeTab === n.id ? " active" : ""}" aria-label="${n.label}">
      ${n.icon}
      ${n.label}
    </a>`).join("")}
  </nav>
</div>

<div id="toast-container" aria-live="polite"></div>
<div class="offline-banner" id="offline-banner">You're offline</div>

<script src="/app.js"></script>
${scripts}
</body>
</html>`;
}

export function bareLayout(opts: { title: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="theme-color" content="#f97316"/>
  <link rel="manifest" href="/manifest.json"/>
  <link rel="stylesheet" href="/app.css"/>
  <title>${escHtml(opts.title)} · Unfat</title>
</head>
<body>
${opts.body}
<div id="toast-container" aria-live="polite"></div>
<script src="/app.js"></script>
</body>
</html>`;
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function flash(msg: string | null, type: "error" | "success" | "info" = "error"): string {
  if (!msg) return "";
  return `<div class="alert alert-${type}" role="alert">${escHtml(msg)}</div>`;
}
