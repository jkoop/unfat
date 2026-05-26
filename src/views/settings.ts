import { layout, escHtml, flash } from "./layout.ts";
import type { User } from "../db.ts";

const UNIT_OPTIONS = {
  unit_mass:        { label: "Mass unit",        options: [["g","Grams (g)"],["oz","Ounces (oz)"],["kg","Kilograms (kg)"],["lbs","Pounds (lbs)"]] },
  unit_volume:      { label: "Volume unit",       options: [["ml","Millilitres (ml)"],["fl oz","Fluid ounces (fl oz)"],["l","Litres (l)"],["cups","Cups"]] },
  unit_water:       { label: "Water unit",        options: [["fl oz","Fluid ounces (fl oz)"],["ml","Millilitres (ml)"],["l","Litres (l)"],["cups","Cups"]] },
  unit_food_weight: { label: "Food weight unit",  options: [["g","Grams (g)"],["oz","Ounces (oz)"],["kg","Kilograms (kg)"],["lbs","Pounds (lbs)"]] },
  unit_user_weight: { label: "Body weight unit",  options: [["lbs","Pounds (lbs)"],["kg","Kilograms (kg)"],["st","Stone (st)"]] },
} as const;

type UnitKey = keyof typeof UNIT_OPTIONS;

export function settingsPage(opts: {
  user: User;
  flash?: string;
  flashType?: "error" | "success" | "info";
}): string {
  const { user } = opts;

  const unitSelects = (Object.entries(UNIT_OPTIONS) as [UnitKey, typeof UNIT_OPTIONS[UnitKey]][]).map(([key, cfg]) => {
    const currentVal = user[key as keyof User] as string;
    const options = (cfg.options as readonly (readonly [string, string])[])
      .map(([val, lbl]) =>
        `<option value="${escHtml(val)}"${currentVal === val ? " selected" : ""}>${escHtml(lbl)}</option>`
      ).join("");
    return `
    <div class="form-group">
      <label for="${key}">${escHtml(cfg.label)}</label>
      <select id="${key}" name="${key}">${options}</select>
    </div>`;
  }).join("");

  return layout({
    title: "Settings",
    user,
    activeTab: "none",
    body: `
<div class="page-header"><h1>Settings</h1></div>
${flash(opts.flash ?? null, opts.flashType ?? "success")}

<div class="card">
  <p class="section-title">Units</p>
  <form method="POST" action="/settings">
    ${unitSelects}
    <button type="submit" class="btn btn-primary">Save Units</button>
  </form>
</div>

<div class="card" style="margin-top:12px">
  <p class="section-title">Password</p>
  <a href="/change-password" class="btn btn-ghost">Change Password</a>
</div>`,
  });
}
