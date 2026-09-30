import { normalizeItems } from "./api.js";
import { dataService } from "./data-service.js";
import { isValidDate, sumAmounts, toAmount } from "./calculations.js";
import { clearPageError, confirmAction, createPageError, currency, dateLabel, escapeHtml, mountAppShell, notify, setBusy, setPageLoading, showPageError } from "./shared.js";

mountAppShell();
const $ = (selector) => document.querySelector(selector); const dialog = $("#goal-dialog"); const form = $("#goal-form"); const contributionDialog = $("#contribution-dialog"); const contributionForm = $("#contribution-form"); const pageError = createPageError(document.getElementById("page-main"));
let goals = []; let editingId = null; let contributionGoalId = null;
function render() {
  const saved = sumAmounts(goals.map((goal) => goal.current)); const target = sumAmounts(goals.map((goal) => goal.target));
  $("#goals-count").textContent = String(goals.length); $("#goals-saved").textContent = currency(saved); $("#goals-target").textContent = currency(target); $("#goals-caption").textContent = `${goals.length} active goal${goals.length === 1 ? "" : "s"}`;
  $("#goals-list").innerHTML = goals.map((goal) => {
    const current = toAmount(goal.current); const amountTarget = toAmount(goal.target); const available = current !== null && amountTarget !== null && amountTarget > 0;
    const progress = available ? Math.min(100, Math.max(0, current / amountTarget * 100)) : 0; const remaining = available ? Math.max(0, amountTarget - current) : null; const complete = available && current >= amountTarget;
    const progressView = available
      ? `<div class="progress-track goal-progress-track" role="progressbar" aria-label="${escapeHtml(goal.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}" aria-valuetext="${Math.round(progress)}% complete"><div class="progress-fill${complete ? " complete" : ""}" style="width:${progress}%"></div></div>`
      : '<p class="panel-caption">Progress unavailable because a required goal amount was not supplied.</p>';
    const contributionLabel = available ? `Add a contribution to ${goal.name}` : `Contribution unavailable; required amounts were not supplied for ${goal.name}`;
    return `<article class="goal-card"><div class="goal-card-top"><span class="goal-icon" aria-hidden="true">◈</span><div class="goal-card-actions"><button class="icon-button" type="button" data-contribute-goal="${escapeHtml(goal.id)}" aria-label="${escapeHtml(contributionLabel)}" title="${escapeHtml(available ? "Add contribution" : "Goal amounts unavailable")}"${available ? "" : " disabled"}>＋</button><button class="icon-button" type="button" data-edit-goal="${escapeHtml(goal.id)}" aria-label="Edit ${escapeHtml(goal.name)}">✎</button><button class="icon-button" type="button" data-delete-goal="${escapeHtml(goal.id)}" aria-label="Delete ${escapeHtml(goal.name)}">×</button></div></div><h3>${escapeHtml(goal.name)}</h3><span class="goal-date">Target date · ${dateLabel(goal.targetDate)}</span><div class="goal-total"><span>${currency(current)} saved</span><strong>of ${currency(amountTarget)}</strong></div>${progressView}<div class="goal-footer"><span>${!available ? "Progress unavailable" : complete ? "Target reached" : `${currency(remaining)} to go`}</span><span>${available ? `${Math.round(progress)}% complete` : "—"}</span></div></article>`;
  }).join("");
  $("#goals-empty").classList.toggle("hidden", goals.length > 0);
}
async function load() {
  $("#page-main").setAttribute("aria-busy", "true"); setPageLoading(true); clearPageError(pageError);
  try { goals = normalizeItems(await dataService.listGoals()); render(); }
  catch (error) { showPageError(pageError, error.message || "Could not load savings goals.", load); }
  finally { $("#page-main").removeAttribute("aria-busy"); setPageLoading(false); }
}
function openForm(goal = null) {
  editingId = goal?.id || null; form.reset(); $("#goal-dialog-title").textContent = goal ? "Edit savings goal" : "Create a goal"; $("#goal-form-message").textContent = "";
  form.elements.name.value = goal?.name || ""; form.elements.target.value = goal?.target ?? ""; form.elements.current.value = goal?.current ?? ""; form.elements.targetDate.value = goal?.targetDate || "";
  dialog.showModal(); $("#goal-name").focus();
}
function openContribution(goal) {
  if (toAmount(goal.current) === null || toAmount(goal.target) === null || toAmount(goal.target) <= 0) return;
  contributionGoalId = goal.id; contributionForm.reset(); $("#contribution-message").textContent = ""; $("#contribution-title").textContent = goal.name;
  $("#contribution-current").textContent = `${currency(goal.current)} saved toward ${currency(goal.target)}`;
  contributionDialog.showModal(); $("#contribution-amount").focus();
}
$("#add-goal").addEventListener("click", () => openForm()); $("#empty-add-goal").addEventListener("click", () => openForm());
form.addEventListener("submit", async (event) => {
  event.preventDefault(); if (!form.reportValidity()) return;
  const targetRaw = String(form.elements.target.value).trim(); const currentRaw = String(form.elements.current.value).trim();
  const value = { name: form.elements.name.value.trim(), target: Number(targetRaw), current: Number(currentRaw), targetDate: form.elements.targetDate.value }; const message = $("#goal-form-message");
  if (value.name.length < 2 || !targetRaw || !currentRaw || !Number.isFinite(value.target) || value.target <= 0 || !Number.isFinite(value.current) || value.current < 0) { message.textContent = "Enter a name, a positive target, and a current amount of zero or more."; return; }
  if (!isValidDate(value.targetDate)) { message.textContent = "Choose a valid target date."; return; }
  const button = form.querySelector('button[type="submit"]'); setBusy(button, true, "Saving…");
  try { const wasEditing = Boolean(editingId); if (wasEditing) await dataService.updateGoal(editingId, value); else await dataService.createGoal(value); dialog.close(); await load(); notify(wasEditing ? "Savings goal updated." : "Savings goal created.", { title: "Plan updated" }); }
  catch (error) { message.textContent = error.message || "Could not save this goal."; }
  finally { setBusy(button, false); }
});
contributionForm.addEventListener("submit", async (event) => {
  event.preventDefault(); if (!contributionForm.reportValidity()) return;
  const amount = toAmount(contributionForm.elements.amount.value); const message = $("#contribution-message"); const goal = goals.find((item) => String(item.id) === String(contributionGoalId)); const current = toAmount(goal?.current);
  if (!goal || amount === null || amount <= 0 || current === null || toAmount(goal.target) === null || toAmount(goal.target) <= 0) { message.textContent = "Enter a contribution greater than zero for a goal with supplied amounts."; return; }
  const button = contributionForm.querySelector('button[type="submit"]'); setBusy(button, true, "Saving…");
  try { await dataService.updateGoal(goal.id, { ...goal, current: current + amount }); contributionDialog.close(); await load(); notify(`${currency(amount)} added to ${goal.name}.`, { title: "Contribution saved" }); }
  catch (error) { message.textContent = error.message || "Could not record that contribution."; }
  finally { setBusy(button, false); }
});
$("#goals-list").addEventListener("click", async (event) => {
  const contribute = event.target.closest("[data-contribute-goal]"); const edit = event.target.closest("[data-edit-goal]"); const remove = event.target.closest("[data-delete-goal]");
  if (contribute) { const goal = goals.find((item) => String(item.id) === contribute.dataset.contributeGoal); if (goal) openContribution(goal); }
  if (edit) { const goal = goals.find((item) => String(item.id) === edit.dataset.editGoal); if (goal) openForm(goal); }
  if (remove) { const goal = goals.find((item) => String(item.id) === remove.dataset.deleteGoal); if (!goal || !await confirmAction({ title: "Delete this savings goal?", message: `“${goal.name}” will be removed. Recorded contributions elsewhere are unchanged.`, confirmLabel: "Delete goal", danger: true })) return; try { await dataService.deleteGoal(goal.id); await load(); notify("Savings goal removed."); } catch (error) { notify(error.message || "Could not remove that goal.", { title: "Delete failed", type: "error" }); } }
});
document.querySelectorAll('[data-close-dialog="goal-dialog"]').forEach((button) => button.addEventListener("click", () => dialog.close()));
document.querySelectorAll('[data-close-dialog="contribution-dialog"]').forEach((button) => button.addEventListener("click", () => contributionDialog.close()));
load();
