import { bareLayout, escHtml, flash } from "./layout.ts";

export function loginPage(opts: { error?: string; redirect?: string } = {}): string {
  return bareLayout({
    title: "Login",
    body: `
<div class="login-wrap">
  <div class="login-box">
    <h1>Un<span>fat</span></h1>
    <p class="tagline">Track what you eat, how you sleep, how you weigh.</p>
    ${flash(opts.error ?? null, "error")}
    <form method="POST" action="/login" autocomplete="on">
      ${opts.redirect ? `<input type="hidden" name="redirect" value="${escHtml(opts.redirect)}"/>` : ""}
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" required autocomplete="username" autofocus/>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password"/>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Sign in</button>
    </form>
  </div>
</div>`,
  });
}

export function changePasswordPage(opts: { error?: string; isFirstLogin?: boolean } = {}): string {
  return bareLayout({
    title: "Change Password",
    body: `
<div class="login-wrap">
  <div class="login-box">
    <h1>Un<span>fat</span></h1>
    ${opts.isFirstLogin
      ? `<p class="tagline">Welcome! Please set a new password before continuing.</p>`
      : `<p class="tagline">Change your password.</p>`}
    ${flash(opts.error ?? null, "error")}
    <form method="POST" action="/change-password" autocomplete="off">
      <div class="form-group">
        <label for="password">New Password</label>
        <input type="password" id="password" name="password" required autocomplete="new-password" autofocus minlength="8"/>
      </div>
      <div class="form-group">
        <label for="confirm">Confirm Password</label>
        <input type="password" id="confirm" name="confirm" required autocomplete="new-password" minlength="8"/>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Set Password</button>
    </form>
  </div>
</div>`,
  });
}

export function disabledPage(): string {
  return bareLayout({
    title: "Account Disabled",
    body: `
<div class="disabled-wrap">
  <h1>Account Disabled</h1>
  <p>Your account has been disabled. Please contact your administrator if you believe this is a mistake.</p>
  <form method="POST" action="/logout">
    <button type="submit" class="btn btn-ghost btn-sm">Sign out</button>
  </form>
</div>`,
  });
}
