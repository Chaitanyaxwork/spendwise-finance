import { getToken, setStoredUser, clearStoredUser, clearToken } from "./api.js";
import { dataService, DEMO_MODE } from "./data-service.js";
import { clearPageError, createPageError, mountAppShell, setPageLoading, showPageError } from "./shared.js";

mountAppShell();
const main = document.getElementById("page-main"); const pageError = createPageError(main);
const $ = (selector) => document.querySelector(selector);
const setText = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value || "Not supplied"; };
function initials(user) {
  const text = String(user?.name || user?.email || "SW").trim();
  return text.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SW";
}
function renderUser(user) {
  const name = user?.name || user?.email?.split("@")[0] || (DEMO_MODE ? "Demo account" : "Account");
  const email = user?.email || (DEMO_MODE ? "demo@example.test" : "Not supplied");
  const badge = initials(user);
  setText("settings-name", name); setText("settings-email", email);
  setText("profile-name", name); setText("profile-email", email);
  setText("profile-type", DEMO_MODE ? "Browser-only demo" : (user?.accountType || user?.account_type || "Connected API account"));
  setText("profile-id", user?.id ?? user?.userId ?? user?.user_id ?? (DEMO_MODE ? "Demo profile" : "Not supplied by API"));
  setText("settings-mode", DEMO_MODE ? "Browser demo" : "Connected API");
  $("#settings-avatar").textContent = badge;
  const sidebarAvatar = document.querySelector(".sidebar-footer .avatar"); if (sidebarAvatar) sidebarAvatar.textContent = badge;
  const sidebarName = document.querySelector(".sidebar-footer strong"); if (sidebarName) sidebarName.textContent = name;
  const topbarName = document.querySelector(".topbar-profile-name"); if (topbarName) topbarName.textContent = name;
  const topbarAvatar = document.querySelector(".topbar-profile .avatar"); if (topbarAvatar) topbarAvatar.textContent = badge;
  setText("profile-state", DEMO_MODE ? "Demo profile supplied by browser-local session state." : "Profile loaded from the connected authentication API.");
}
async function loadProfile() {
  main.setAttribute("aria-busy", "true"); setPageLoading(true); clearPageError(pageError);
  try {
    if (!DEMO_MODE && !getToken()) {
      renderUser(null); setText("profile-state", "No active API session.");
      pageError.hidden = false; pageError.setAttribute("role", "status");
      pageError.innerHTML = '<section class="empty-state"><h3>Sign in to view your profile</h3><p>This connected account has no active session in this browser.</p><a class="button button-secondary" href="./login.html">Go to sign in</a></section>';
      return;
    }
    const payload = await dataService.me(); const user = payload?.user || payload?.profile || payload;
    if (!user || typeof user !== "object") throw new Error("The profile endpoint did not return account information.");
    if (!DEMO_MODE) setStoredUser(user);
    renderUser(user);
  } catch (error) { showPageError(pageError, error.message || "Profile information could not be loaded.", loadProfile); }
  finally { main.removeAttribute("aria-busy"); setPageLoading(false); }
}
const preference = $("#compact-rows");
try { preference.checked = localStorage.getItem("spendwise_compact_rows") === "true"; document.body.classList.toggle("compact-rows", preference.checked); } catch { preference.checked = false; }
preference.addEventListener("change", () => {
  try { localStorage.setItem("spendwise_compact_rows", String(preference.checked)); document.body.classList.toggle("compact-rows", preference.checked); }
  catch { preference.checked = false; document.body.classList.remove("compact-rows"); setText("profile-state", "Browser storage is unavailable; this preference could not be saved."); }
});
function logout() {
  clearToken(); clearStoredUser();
  if (DEMO_MODE) dataService.clearDemoUser?.();
  window.location.href = "./login.html";
}
$("#settings-logout").addEventListener("click", logout);
loadProfile();
