import { calculateSavingsScenario, toAmount } from "./calculations.js";
import { currency, escapeHtml, mountAppShell } from "./shared.js";

mountAppShell();
const $ = (selector) => document.querySelector(selector); let projectionChart;
const form = $("#simulator-form"); const returnToggle = $("#sim-use-return"); const returnInput = $("#sim-return");
function termLabel(months) {
  const years = Math.floor(months / 12); const rest = months % 12;
  if (years && !rest) return `${years} year${years === 1 ? "" : "s"}`;
  if (years) return `${years} year${years === 1 ? "" : "s"} and ${rest} month${rest === 1 ? "" : "s"}`;
  return `${months} month${months === 1 ? "" : "s"}`;
}
function chartMessage(message) {
  const state = $("#sim-chart-state"); state.hidden = false; state.className = "panel-state"; state.textContent = message; $("#projection-chart").parentElement.hidden = true;
}
function renderChart(result) {
  if (!window.Chart) { chartMessage("Chart.js could not load. The projection details remain available below."); return; }
  $("#sim-chart-state").hidden = true; $("#sim-chart-state").replaceChildren(); $("#projection-chart").parentElement.hidden = false;
  projectionChart?.destroy();
  const rows = result.rows; const chartRows = rows.length > 240 ? rows.filter((_, index) => index % Math.ceil(rows.length / 240) === 0 || index === rows.length - 1) : rows;
  projectionChart = new Chart(document.getElementById("projection-chart"), { type: "line", data: { labels: chartRows.map((row) => `Month ${row.month}`), datasets: [{ label: "Projected balance", data: chartRows.map((row) => Number(row.total)), borderColor: "#236b66", backgroundColor: "rgba(35,107,102,.09)", fill: true, tension: .3, pointRadius: chartRows.length > 60 ? 0 : 2, pointHoverRadius: 4, borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => currency(context.parsed.y, 2) } }, title: { display: false } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#657878", maxTicksLimit: 8, font: { size: 12 } } }, y: { beginAtZero: false, grid: { color: "#e4eae6" }, border: { display: false }, ticks: { color: "#657878", font: { size: 12 }, callback: (value) => currency(value, 0) } } } } });
}
function renderTable(rows) {
  const shown = rows.length <= 14 ? rows : [...rows.slice(0, 6), { separator: true }, ...rows.slice(-6)];
  $("#projection-rows").innerHTML = shown.map((row) => row.separator ? '<tr><td colspan="3" class="panel-caption">… intervening months …</td></tr>' : `<tr><td>Month ${row.month}</td><td>${currency(row.contribution, 2)}</td><td class="align-right">${currency(row.total, 2)}</td></tr>`).join("");
}
function clearResults(message) {
  $("#projected-total").textContent = "—"; $("#projected-caption").textContent = "Adjust the assumptions to see a scenario."; $("#projected-monthly").textContent = "—"; $("#target-progress").textContent = "—"; $("#target-progress-note").textContent = "Calculated from your target"; $("#required-contribution").textContent = "—"; $("#projection-period-label").textContent = "—"; $("#projection-rows").replaceChildren();
  const progress = $("#target-progress-bar"); progress.setAttribute("aria-valuenow", "0"); $("#target-progress-fill").style.width = "0%";
  $("#simulator-message").textContent = message; $("#simulator-message").className = "form-message";
  projectionChart?.destroy(); projectionChart = null;
}
function update() {
  const months = toAmount($("#sim-months").value); const currentSavings = toAmount($("#sim-current").value); const monthlyContribution = toAmount($("#sim-contribution").value); const targetAmount = toAmount($("#sim-target").value); const annualReturnRate = returnToggle.checked ? toAmount(returnInput.value) : 0;
  $("#sim-months-output").textContent = months === null ? "Choose a time period" : `${termLabel(months)} (${months} months)`;
  if ([months, currentSavings, monthlyContribution, targetAmount, annualReturnRate].some((value) => value === null || value < 0) || targetAmount <= 0 || months < 1 || annualReturnRate > 30) {
    clearResults("Enter valid non-negative amounts, a target greater than zero, and an annual return between 0% and 30%."); return;
  }
  const result = calculateSavingsScenario({ currentSavings, monthlyContribution, targetAmount, months, annualReturnRate });
  if (result.error) { clearResults(result.error); return; }
  $("#projected-total").textContent = currency(result.projectedSavings, 0);
  $("#projected-caption").textContent = `After ${termLabel(months)} · ${returnToggle.checked ? `${annualReturnRate.toFixed(1)}% annual return assumed` : "no return assumed"}`;
  $("#projected-monthly").textContent = currency(monthlyContribution, 2);
  $("#projection-period-label").textContent = `${termLabel(months)} · deposits at month-end`;
  $("#target-progress").textContent = `${result.progressPercent.toFixed(1)}%`;
  const complete = result.projectedSavings >= targetAmount;
  $("#target-progress-note").textContent = complete ? `Projected to meet the ${currency(targetAmount)} target within this scenario.` : `${currency(Math.max(0, targetAmount - result.projectedSavings))} below the target at the end of the period.`;
  $("#target-progress-bar").setAttribute("aria-valuenow", String(Math.min(100, Math.round(result.progressPercent))));
  $("#target-progress-fill").style.width = `${result.progressPercent}%`;
  $("#required-contribution").textContent = currency(result.requiredMonthlyContribution, 2);
  $("#simulator-message").textContent = returnToggle.checked
    ? `Scenario only · uses your ${annualReturnRate.toFixed(1)}% annual assumption compounded monthly; actual returns vary.`
    : "Scenario only · assumes steady month-end contributions and no interest or investment return.";
  $("#simulator-message").className = "form-message is-info";
  renderChart(result); renderTable(result.rows);
}
form.addEventListener("input", update);
form.addEventListener("change", update);
returnToggle.addEventListener("change", () => { returnInput.disabled = !returnToggle.checked; update(); });
returnInput.disabled = !returnToggle.checked;
update();
