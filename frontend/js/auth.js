import { API_BASE_URL, setStoredUser, setToken } from "./api.js";
import { DEMO_MODE, dataService } from "./data-service.js";
import { mountAuthShell, notify, setBusy } from "./shared.js";

mountAuthShell();

const message = (node, text, kind = "error") => { if (!node) return; node.textContent = text; node.className = `form-message${kind === "success" ? " is-success" : kind === "info" ? " is-info" : ""}`; };

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    button.textContent = visible ? "Hide" : "Show";
    button.setAttribute("aria-label", `${visible ? "Hide" : "Show"} password`);
  });
});

const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("login-message");
    const button = loginForm.querySelector('button[type="submit"]');
    if (!loginForm.reportValidity()) return;
    const email = loginForm.elements.email.value.trim();
    const password = loginForm.elements.password.value;
    message(status, "Signing you in…", "info"); setBusy(button, true, "Signing in…");
    try {
      const result = await dataService.login({ email, password });
      const token = result?.access_token || result?.token;
      if (!DEMO_MODE && token) { setToken(token); setStoredUser(result?.user || result?.profile || null); }
      if (!DEMO_MODE && !token) throw new Error("The API did not return an access token.");
      message(status, DEMO_MODE ? "Demo session ready. Opening your overview…" : "Signed in. Opening your overview…", "success");
      window.setTimeout(() => { window.location.href = "./dashboard.html"; }, 450);
    } catch (error) {
      message(status, error.message || "We couldn't sign you in. Check your details and try again.");
    } finally { setBusy(button, false); }
  });
  document.getElementById("forgot-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    notify(API_BASE_URL ? "Password recovery is not part of the configured frontend API contract yet." : "Password recovery will be available when a backend is connected.", { title: "Recovery not configured", type: "error" });
  });
}

const registerForm = document.getElementById("register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("register-message");
    const button = registerForm.querySelector('button[type="submit"]');
    if (!registerForm.reportValidity()) return;
    const name = registerForm.elements.name.value.trim();
    const email = registerForm.elements.email.value.trim();
    const password = registerForm.elements.password.value;
    const confirmPassword = registerForm.elements.confirmPassword.value;
    if (name.length < 2) { message(status, "Enter a name with at least two characters."); return; }
    if (password !== confirmPassword) { message(status, "Those passwords do not match."); registerForm.elements.confirmPassword.focus(); return; }
    if (!registerForm.elements.terms.checked) { message(status, DEMO_MODE ? "Please confirm this is a sample-data demo account." : "Please confirm that your account details will be sent to the configured API."); return; }
    message(status, "Creating your account…", "info"); setBusy(button, true, "Creating…");
    try {
      const result = await dataService.register({ name, email, password });
      const token = result?.access_token || result?.token;
      if (!DEMO_MODE && token) { setToken(token); setStoredUser(result?.user || result?.profile || null); }
      if (!DEMO_MODE && token) {
        message(status, "Account created. Opening your overview…", "success");
        window.setTimeout(() => { window.location.href = "./dashboard.html"; }, 450);
      } else if (!DEMO_MODE) {
        message(status, "Account created. Please log in to continue.", "success");
        window.setTimeout(() => { window.location.href = "./login.html"; }, 800);
      } else {
        message(status, "Demo account ready. Opening your overview…", "success");
        window.setTimeout(() => { window.location.href = "./dashboard.html"; }, 450);
      }
    } catch (error) {
      message(status, error.message || "We couldn't create that account. Please try again.");
    } finally { setBusy(button, false); }
  });
}
