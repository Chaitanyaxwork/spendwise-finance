import { normalizeItems } from "./api.js";
import { dataService } from "./data-service.js";
import { calculateBudgets, currentMonthKey, sumAmounts } from "./calculations.js";
import { clearPageError, confirmAction, createPageError, currency, escapeHtml, monthLabel, mountAppShell, notify, setBusy, setPageLoading, showPageError } from "./shared.js";

mountAppShell();
const $ = (selector) => document.querySelector(selector); const dialog = $("#budget-dialog"); const form = $("#budget-form"); const pageError = createPageError(document.getElementById("page-main"));
let budgets = []; let transactions = []; let editingId = null;
const glyph = (category) => ({ Housing: "⌂", Food: "◉", Dining: "◌", Transport: "↗", Utilities: "⌁", Healthcare: "✚", Shopping: "◇", Entertainment: "♫" }[category] || "•");
function render() {
  const status = calculateBudgets(budgets, transactions, currentMonthKey());
  const planned = sumAmounts(budgets.map((item) => item.limit)); const used = sumAmounts(status.map((item) => item.used));
  const remaining = planned === null || used === null ? null : planned - used;
  const utilization = planned !== null && used !== null && planned > 0 ? `${(used / planned * 100).toFixed(1)}%` : planned === 0 && used === 0 ? "0.0%" : "—";
  $("#budget-total").textContent = currency(planned); $("#budget-used").textContent = currency(used); $("#budget-remaining").textContent = currency(remaining); $("#budget-period").textContent = monthLabel();
  $("#budget-utilization").textContent = utilization;
  $("#budget-remaining-note").textContent = remaining === null ? "Some limits or transactions were not supplied" : remaining >= 0 ? "Across your monthly plan" : `${currency(Math.abs(remaining))} over the combined limits`;
  $("#budget-count").textContent = `${budgets.length} categor${budgets.length === 1 ? "y" : "ies"}`;
  $("#budget-list").innerHTML = status.map((item) => {
    const available = item.status !== "unavailable"; const width = available ? Math.min(100, Math.max(0, item.progress)) : 0;
    const percent = available ? `${item.progress.toFixed(0)}% used` : "Progress unavailable";
    const remainder = item.remaining === null ? "Remaining amount unavailable" : item.remaining >= 0 ? `${currency(item.remaining)} remaining` : `${currency(Math.abs(item.remaining))} over limit`;
    const warning = item.status === "warning" || item.status === "danger";
    return `<article class="budget-card ${item.status === "warning" ? "is-warning" : item.status === "danger" ? "is-danger" : ""}"><div class="budget-card-top"><span class="category-symbol" aria-hidden="true">${glyph(item.category)}</span><div class="goal-card-actions"><button class="icon-button" type="button" data-edit-budget="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.category)} budget">✎</button><button class="icon-button" type="button" data-delete-budget="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.category)} budget">×</button></div></div><h3>${escapeHtml(item.category)}</h3><div class="budget-amounts"><span>Spent <strong>${currency(item.used)}</strong></span><span>Budget <strong>${currency(item.limit)}</strong></span></div><div class="progress-track" role="progressbar" aria-label="${escapeHtml(item.category)} budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${available ? Math.min(100, Math.round(item.progress)) : 0}" aria-valuetext="${available ? escapeHtml(percent) : "Budget progress unavailable because an amount was not supplied"}"><div class="progress-fill ${item.status}" style="width:${width}%"></div></div><div class="budget-card-footer"><span>${remainder}</span><span class="budget-percent ${item.status}">${percent}</span></div>${warning ? `<p class="budget-warning ${item.status}">${item.status === "danger" ? "Budget limit reached or exceeded" : "Approaching budget limit"}</p>` : item.status === "unavailable" ? '<p class="panel-caption">A required limit or transaction amount was not supplied by the API.</p>' : ""}</article>`;
  }).join("");
  $("#budget-empty").classList.toggle("hidden", budgets.length > 0);
}
async function load() {
  $("#page-main").setAttribute("aria-busy", "true"); setPageLoading(true); clearPageError(pageError);
  try { const [budgetPayload, transactionPayload] = await Promise.all([dataService.listBudgets(), dataService.listTransactions()]); budgets = normalizeItems(budgetPayload); transactions = normalizeItems(transactionPayload); render(); }
  catch (error) { showPageError(pageError, error.message || "Could not load budgets.", load); }
  finally { $("#page-main").removeAttribute("aria-busy"); setPageLoading(false); }
}
function openForm(item = null) { editingId = item?.id || null; form.reset(); $("#budget-dialog-title").textContent = item ? "Edit budget" : "Add a budget"; $("#budget-form-message").textContent = ""; form.elements.category.value = item?.category || ""; form.elements.limit.value = item?.limit ?? ""; form.elements.category.readOnly = Boolean(item); dialog.showModal(); $("#budget-category").focus(); }
$("#add-budget").addEventListener("click", () => openForm()); $("#empty-add-budget").addEventListener("click", () => openForm());
form.addEventListener("submit", async (event) => {
  event.preventDefault(); if (!form.reportValidity()) return;
  const value = { category: form.elements.category.value.trim(), limit: Number(form.elements.limit.value) }; const message = $("#budget-form-message");
  if (!value.category || !Number.isFinite(value.limit) || value.limit <= 0) { message.textContent = "Enter a category and monthly limit greater than zero."; return; }
  const button = form.querySelector('button[type="submit"]'); setBusy(button, true, "Saving…");
  try { const wasEditing = Boolean(editingId); if (wasEditing) await dataService.updateBudget(editingId, value); else await dataService.createBudget(value); dialog.close(); await load(); notify(wasEditing ? "Budget updated." : "Budget added.", { title: "Plan updated" }); }
  catch (error) { message.textContent = error.message || "Could not save this budget."; }
  finally { setBusy(button, false); }
});
$("#budget-list").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-budget]"); const remove = event.target.closest("[data-delete-budget]");
  if (edit) { const item = budgets.find((row) => String(row.id) === edit.dataset.editBudget); if (item) openForm(item); }
  if (remove) { const item = budgets.find((row) => String(row.id) === remove.dataset.deleteBudget); if (!item || !await confirmAction({ title: "Delete this budget?", message: `The ${item.category} limit will be removed. Recorded transactions will remain unchanged.`, confirmLabel: "Delete budget", danger: true })) return; try { await dataService.deleteBudget(item.id); await load(); notify("Budget removed."); } catch (error) { notify(error.message || "Could not remove that budget.", { title: "Delete failed", type: "error" }); } }
});
document.querySelectorAll('[data-close-dialog="budget-dialog"]').forEach((button) => button.addEventListener("click", () => dialog.close()));
load();
