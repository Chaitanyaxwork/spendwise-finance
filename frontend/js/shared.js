import { DEMO_MODE, dataService } from "./data-service.js";
import { clearStoredUser, clearToken, getStoredUser } from "./api.js";

const pages = [
  { id: "dashboard", href: "./dashboard.html", label: "Dashboard", icon: "dashboard", group: "Overview" },
  { id: "transactions", href: "./transactions.html", label: "Transactions", icon: "transactions", group: "Overview" },
  { id: "budgets", href: "./budgets.html", label: "Budgets", icon: "budgets", group: "Overview" },
  { id: "goals", href: "./goals.html", label: "Savings goals", icon: "goals", group: "Overview" },
  { id: "analytics", href: "./analytics.html", label: "Analytics", icon: "analytics", group: "Plan & insights" },
  { id: "insights", href: "./insights.html", label: "Insights", icon: "insights", group: "Plan & insights" },
  { id: "simulator", href: "./simulator.html", label: "Savings simulator", icon: "simulator", group: "Plan & insights" }
];
const iconPaths = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  transactions: '<path d="M4 7h15M15 3l4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  budgets: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  goals: '<path d="M12 21s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11Z"/><path d="m9 12 2 2 4-4"/>',
  analytics: '<path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/><path d="M16 7h3v3"/>',
  insights: '<path d="M9 18h6M10 22h4M8 14a7 7 0 1 1 8 0c-1 .7-1.5 1.4-1.7 2.5h-4.6C9.5 15.4 9 14.7 8 14Z"/>',
  simulator: '<path d="M4 18h16M6 15l4-5 3 3 5-7"/><circle cx="18" cy="6" r="1"/>',
  settings: '<circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0M19 8h2M3 8h2M12 2v2"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>'
};
const icon = (name) => `<svg class="nav-icon nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.dashboard}</svg>`;
const logo = '<img src="./assets/logo.svg" alt="" width="34" height="34">';
const numberFormatters = new Map();

export const currency = (value, digits = 0) => {
  const precision = Math.max(0, Math.min(2, Number(digits) || 0));
  if (!numberFormatters.has(precision)) {
    numberFormatters.set(precision, new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: precision, maximumFractionDigits: precision }));
  }
  if (value === null || value === undefined || typeof value === "boolean" || (typeof value === "string" && value.trim() === "")) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return numberFormatters.get(precision).format(amount);
};
export const dateLabel = (value, options = { month: "short", day: "numeric", year: "numeric" }) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString("en-IN", options);
};
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export const monthLabel = (date = new Date()) => date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export function getCurrentUser() {
  if (DEMO_MODE) return dataService.getDemoUser?.() || { name: "Demo account", email: "demo@example.test" };
  return getStoredUser();
}
export const getDisplayName = (user) => user?.name || user?.email?.split("@")[0] || "there";
function initials(user) {
  const value = String(user?.name || user?.email || "SW").trim();
  return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SW";
}
function accountLabel(user) {
  if (DEMO_MODE) return user?.name || "Demo account";
  return user?.name || user?.email || "Connected account";
}

function makeToastRegion() {
  let region = document.querySelector(".toast-region");
  if (!region) { region = document.createElement("div"); region.className = "toast-region"; region.setAttribute("aria-live", "polite"); region.setAttribute("aria-atomic", "false"); document.body.append(region); }
  return region;
}
export function notify(message, { title = "", type = "success", duration = 4200 } = {}) {
  const region = makeToastRegion();
  const toast = document.createElement("div"); toast.className = `toast${type === "error" ? " is-error" : ""}`; toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `<span class="toast-mark" aria-hidden="true">${type === "error" ? "!" : "✓"}</span><div>${title ? `<strong>${escapeHtml(title)}</strong>` : ""}<p>${escapeHtml(message)}</p></div><button type="button" class="toast-close" aria-label="Dismiss notification">×</button>`;
  const remove = () => toast.remove(); toast.querySelector(".toast-close").addEventListener("click", remove); region.append(toast); if (duration > 0) window.setTimeout(remove, duration); return toast;
}

export function setPageLoading(visible, message = "Loading your financial data…") {
  const banner = document.getElementById("page-loading");
  if (!banner) return;
  banner.hidden = !visible;
  const text = banner.querySelector("span:last-child"); if (text) text.textContent = message;
  const main = document.getElementById("page-main");
  const skeleton = document.getElementById("page-skeleton");
  if (!main || !skeleton) return;
  if (visible && main.dataset.loaded !== "true") { skeleton.hidden = false; main.hidden = true; }
  if (!visible) { skeleton.hidden = true; main.hidden = false; main.dataset.loaded = "true"; }
}
export function showPageError(container, message, retry) {
  if (!container) return;
  container.hidden = false;
  container.setAttribute("role", "alert");
  container.innerHTML = `<section class="empty-state error-state"><span class="empty-icon" aria-hidden="true">!</span><h3>We couldn't load this view</h3><p>${escapeHtml(message || "Please try again.")}</p>${retry ? '<button class="button button-secondary" type="button" data-retry>Try again</button>' : ""}</section>`;
  if (retry) container.querySelector("[data-retry]")?.addEventListener("click", retry);
}
export function createPageError(parent = document.getElementById("page-main")) {
  const node = document.createElement("div");
  node.className = "page-error-slot";
  node.hidden = true;
  (parent?.querySelector(".page-content") || parent)?.prepend(node);
  return node;
}
export function clearPageError(container) {
  if (!container) return;
  container.hidden = true;
  container.removeAttribute("role");
  container.replaceChildren();
}
export function setBusy(button, busy, label = "Working…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.querySelector(".button-label")?.textContent || button.textContent;
    button.disabled = true;
    const target = button.querySelector(".button-label"); if (target) target.textContent = label;
    button.setAttribute("aria-busy", "true");
  } else {
    button.disabled = false; button.removeAttribute("aria-busy");
    const target = button.querySelector(".button-label"); if (target && button.dataset.originalLabel) target.textContent = button.dataset.originalLabel;
  }
}

export function confirmAction({ title = "Please confirm", message = "Continue with this action?", confirmLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog"); dialog.className = "confirm-dialog";
    dialog.innerHTML = '<div class="confirm-content"><span class="confirm-icon" aria-hidden="true">!</span><div><h2></h2><p class="confirm-message"></p></div></div><div class="dialog-actions"><button class="button button-quiet" type="button" data-choice="cancel">Cancel</button><button class="button button-primary" type="button" data-choice="confirm"></button></div>';
    dialog.querySelector("h2").textContent = title;
    dialog.querySelector(".confirm-message").textContent = message;
    const accept = dialog.querySelector('[data-choice="confirm"]'); accept.textContent = confirmLabel;
    if (danger) accept.classList.add("button-danger");
    document.body.append(dialog);
    let result = false;
    dialog.querySelector('[data-choice="confirm"]').addEventListener("click", () => { result = true; dialog.close(); });
    dialog.querySelector('[data-choice="cancel"]').addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { dialog.remove(); resolve(result); }, { once: true });
    dialog.showModal();
  });
}

function sidebar(active) {
  const user = getCurrentUser();
  const renderGroup = (group) => `<p class="sidebar-label">${group}</p><div class="sidebar-nav">${pages.filter((page) => page.group === group).map((page) => `<a href="${page.href}"${page.id === active ? ' aria-current="page"' : ""}>${icon(page.icon)}<span>${page.label}</span></a>`).join("")}</div>`;
  return `<aside class="sidebar" id="app-sidebar" aria-label="SpendWise navigation"><a class="sidebar-brand" href="./dashboard.html">${logo}<span>SpendWise</span></a><div class="sidebar-section">${renderGroup("Overview")}</div><div class="sidebar-section">${renderGroup("Plan & insights")}</div><div class="sidebar-spacer"></div><div class="sidebar-divider"></div><a class="sidebar-profile-link${active === "settings" ? " is-active" : ""}" href="./settings.html"${active === "settings" ? ' aria-current="page"' : ""}>${icon("settings")}<span>Settings & profile</span></a><button class="sidebar-logout" id="sidebar-logout" type="button">${icon("logout")}<span>Log out</span></button><div class="sidebar-footer"><span class="avatar" aria-hidden="true">${escapeHtml(initials(user))}</span><div><strong>${escapeHtml(accountLabel(user))}</strong><small>${DEMO_MODE ? "Browser-only demo" : "Connected account"}</small></div></div></aside>`;
}

function logout() {
  if (!DEMO_MODE) dataService.logout?.().catch(() => {});
  clearToken(); clearStoredUser();
  if (DEMO_MODE) dataService.clearDemoUser?.();
  window.location.href = "./login.html";
}
function applyPreferences() {
  try { document.body.classList.toggle("compact-rows", localStorage.getItem("spendwise_compact_rows") === "true"); }
  catch { /* Preferences remain optional when storage is unavailable. */ }
}

export function mountAppShell() {
  const root = document.getElementById("app");
  const template = document.getElementById("page-content");
  if (!root || !template) return;
  document.body.classList.add("authenticated-body"); applyPreferences();
  const { pageTitle = "Dashboard", pageSubtitle = "Your money, made clearer.", active = "dashboard" } = document.body.dataset;
  root.innerHTML = `<div class="app-layout">${sidebar(active)}<button class="mobile-scrim" id="nav-scrim" type="button" aria-label="Close navigation"></button><div class="app-main"><header class="app-topbar"><div class="topbar-heading"><button class="menu-toggle" id="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="app-sidebar"><span></span><span></span><span></span></button><div><h1>${escapeHtml(pageTitle)}</h1><p>${escapeHtml(pageSubtitle)}</p></div></div><div class="topbar-actions"><span class="demo-status${DEMO_MODE ? " is-demo" : " is-connected"}"><i></i>${DEMO_MODE ? "Demo data" : "Connected API"}</span><a class="topbar-profile" href="./settings.html" aria-label="Open profile and settings"><span class="avatar" aria-hidden="true">${escapeHtml(initials(getCurrentUser()))}</span><span class="topbar-profile-name">${escapeHtml(accountLabel(getCurrentUser()))}</span></a></div></header><div id="page-loading" class="loading-banner" hidden role="status"><span class="loading-spinner" aria-hidden="true"></span><span>Loading your financial data…</span></div><div id="page-skeleton" class="page-skeleton" hidden aria-hidden="true"><div class="skeleton-metrics"><i></i><i></i><i></i><i></i></div><div class="skeleton-panels"><i></i><i></i></div><i class="skeleton-wide"></i></div><main id="page-main" tabindex="-1"></main></div></div>`;
  root.querySelector("#page-main").append(template.content.cloneNode(true));
  const menu = root.querySelector("#menu-toggle"); const nav = root.querySelector("#app-sidebar"); const scrim = root.querySelector("#nav-scrim");
  const close = () => { nav.classList.remove("is-open"); scrim.classList.remove("is-visible"); menu.setAttribute("aria-expanded", "false"); menu.setAttribute("aria-label", "Open navigation"); };
  menu.addEventListener("click", () => { const open = !nav.classList.contains("is-open"); nav.classList.toggle("is-open", open); scrim.classList.toggle("is-visible", open); menu.setAttribute("aria-expanded", String(open)); menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation"); if (open) nav.querySelector('a[aria-current="page"]')?.focus(); });
  scrim.addEventListener("click", close);
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));
  nav.querySelector("#sidebar-logout").addEventListener("click", logout);
  window.addEventListener("keydown", (event) => { if (event.key === "Escape" && nav.classList.contains("is-open")) { close(); menu.focus(); } });
  window.addEventListener("spendwise:unauthorized", () => { notify("Your session has expired. Please log in again.", { type: "error", title: "Session ended" }); window.setTimeout(() => { window.location.href = "./login.html"; }, 900); }, { once: true });
}

export function mountAuthShell() {
  const root = document.getElementById("app"); const template = document.getElementById("page-content"); if (!root || !template) return;
  const mode = document.body.dataset.authMode === "register" ? "register" : "login";
  root.innerHTML = `<div class="auth-layout"><aside class="auth-aside"><a class="brand-lockup" href="./index.html">${logo}<span>SpendWise</span></a><div class="auth-aside-copy"><h2>Clarity is a good place to start.</h2><p>Bring the details together, find the patterns, and take your next step with confidence.</p></div><div class="auth-aside-foot">Your money. Your insights. Your future.</div></aside><main class="auth-main"><div class="auth-main-wrap"><div class="auth-topline"><a class="auth-top-link" href="./index.html">← Back to SpendWise</a><span class="demo-inline"><i></i> ${DEMO_MODE ? "Demo mode" : "Connected API"}</span></div><div id="auth-content"></div></div></main></div>`;
  root.querySelector("#auth-content").append(template.content.cloneNode(true));
  if (mode === "register") root.querySelector("#auth-content").classList.add("auth-register");
  if (!DEMO_MODE) {
    const note = root.querySelector(".demo-note"); if (note) note.textContent = "Only connect a trusted HTTPS API. Authentication and sensitive account data are handled by that service.";
    const terms = root.querySelector("#register-form .checkbox-row span"); if (terms) terms.textContent = "I understand my account details will be sent to the configured API.";
  }
}
