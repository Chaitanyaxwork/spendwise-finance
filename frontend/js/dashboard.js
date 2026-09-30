import { normalizeItems } from "./api.js";
import { dataService, DEMO_MODE } from "./data-service.js";
import { calculateDashboard, toAmount } from "./calculations.js";
import { clearPageError, createPageError, currency, dateLabel, escapeHtml, getCurrentUser, getDisplayName, monthLabel, mountAppShell, notify, setPageLoading, showPageError } from "./shared.js";

mountAppShell();
const main = document.getElementById("page-main");
const errorBox = createPageError(main);
let cashflowChart; let trendChart; let categoryChart;
const colors = ["#1f6b64", "#6fb0a0", "#d3a25a", "#4f7f9a", "#b8655a", "#9aa96b", "#7d7ba3", "#c48b5c"];
const setText = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
const rowsFrom = (payload, keys = ["items", "months", "series", "results", "alerts", "recurring", "anomalies", "forecast"]) => {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
};
const safe = async (promise) => { try { return { data: await promise, error: null }; } catch (error) { return { data: null, error }; } };
function chartOptions() {
  return { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 18, color: "#526666", font: { size: 12 } } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label || context.label}: ${currency(context.parsed.y ?? context.parsed, 0)}` } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#657878", font: { size: 12 } } }, y: { beginAtZero: true, grid: { color: "#e4eae6" }, border: { display: false }, ticks: { color: "#657878", font: { size: 12 }, callback: (value) => currency(value, 0) } } } };
}
function chartEmpty(canvasId, message) {
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  canvas.hidden = true;
  let empty = canvas.parentElement.querySelector(".chart-empty");
  if (!empty) { empty = document.createElement("p"); empty.className = "chart-empty"; canvas.parentElement.append(empty); }
  empty.textContent = message;
}
function prepareCanvas(canvasId) {
  const canvas = document.getElementById(canvasId); if (!canvas) return null;
  canvas.parentElement.querySelector(".chart-empty")?.remove(); canvas.hidden = false;
  return canvas;
}
function renderCharts(summary) {
  if (!window.Chart) {
    ["cashflow-chart", "spending-trend-chart", "category-chart"].forEach((id) => chartEmpty(id, "Charts need an internet connection to load Chart.js."));
    return;
  }
  cashflowChart?.destroy(); trendChart?.destroy(); categoryChart?.destroy();
  const months = summary.monthSeries;
  if (months.some((month) => month.income === null || month.expenses === null)) chartEmpty("cashflow-chart", "Monthly totals are unavailable because one or more transaction amounts were not supplied.");
  else if (months.some((month) => month.income || month.expenses)) {
    cashflowChart = new Chart(prepareCanvas("cashflow-chart"), { type: "bar", data: { labels: months.map((item) => item.label), datasets: [{ label: "Income", data: months.map((item) => item.income), backgroundColor: "#2e7d6e", borderRadius: 6, maxBarThickness: 24 }, { label: "Expenses", data: months.map((item) => item.expenses), backgroundColor: "#d6a765", borderRadius: 6, maxBarThickness: 24 }] }, options: { ...chartOptions(), scales: { ...chartOptions().scales, x: { ...chartOptions().scales.x, stacked: false } } } });
  } else chartEmpty("cashflow-chart", "No income or expense records are available for this period.");
  const trend = summary.trendSeries;
  if (trend.some((month) => month.expenses === null)) chartEmpty("spending-trend-chart", "The spending trend is unavailable because one or more expense amounts were not supplied.");
  else if (trend.some((month) => month.expenses)) {
    trendChart = new Chart(prepareCanvas("spending-trend-chart"), { type: "line", data: { labels: trend.map((item) => item.label), datasets: [{ label: "Recorded expenses", data: trend.map((item) => item.expenses), borderColor: "#236b66", backgroundColor: "rgba(35,107,102,.09)", fill: true, tension: .28, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2 }] }, options: { ...chartOptions(), plugins: { ...chartOptions().plugins, legend: { display: false } } } });
  } else chartEmpty("spending-trend-chart", "No expense records are available for this period.");
  const allEntries = Object.entries(summary.categoryTotals);
  if (allEntries.some(([, total]) => total === null)) { chartEmpty("category-chart", "Category totals are unavailable because one or more expense amounts were not supplied."); document.getElementById("category-legend").innerHTML = ""; }
  else if (allEntries.length) {
    const entries = allEntries.sort((a, b) => b[1] - a[1]).slice(0, 8);
    categoryChart = new Chart(prepareCanvas("category-chart"), { type: "doughnut", data: { labels: entries.map(([name]) => name), datasets: [{ data: entries.map(([, total]) => total), backgroundColor: colors, borderWidth: 3, borderColor: "#fcfdfb", hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "69%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.label}: ${currency(context.parsed, 0)}` } } } } });
    const legend = document.getElementById("category-legend"); legend.innerHTML = entries.map(([name, amount], index) => `<span><i style="background:${colors[index]}"></i>${escapeHtml(name)} <strong>${currency(amount)}</strong></span>`).join("");
  } else { chartEmpty("category-chart", "No category spending is recorded this month."); document.getElementById("category-legend").innerHTML = ""; }
}
function comparisonText(change, higherIsGood = true, unit = "%") {
  if (change === null || !Number.isFinite(change)) return "No previous-month comparison";
  if (Math.abs(change) < .05) return "About the same as last month";
  const favorable = change > 0 ? higherIsGood : !higherIsGood;
  const direction = change > 0 ? "↑" : "↓";
  return `${direction} ${Math.abs(change).toFixed(1)}${unit} vs last month · ${favorable ? "favorable" : "review"}`;
}
function setComparison(id, change, higherIsGood = true, unit = "%") {
  const node = document.getElementById(id); if (!node) return;
  node.textContent = comparisonText(change, higherIsGood, unit);
  node.classList.toggle("is-positive", change !== null && Math.abs(change) >= .05 && (change > 0 ? higherIsGood : !higherIsGood));
  node.classList.toggle("is-negative", change !== null && Math.abs(change) >= .05 && (change > 0 ? !higherIsGood : higherIsGood));
}
function renderProgressItems(root, items, kind) {
  if (!items.length) { root.innerHTML = `<p class="panel-caption">No ${kind === "budget" ? "budgets" : "savings goals"} yet. <a class="small-link" href="./${kind === "budget" ? "budgets" : "goals"}.html">Add one</a></p>`; return; }
  if (kind === "budget") {
    root.innerHTML = items.slice(0, 4).map((item) => item.status === "unavailable"
      ? `<div class="progress-item"><div class="progress-meta"><strong>${escapeHtml(item.category)}</strong><span>${currency(item.used)} / ${currency(item.limit)}</span></div><p class="panel-caption">Budget progress unavailable because a required amount was not supplied.</p></div>`
      : `<div class="progress-item"><div class="progress-meta"><strong>${escapeHtml(item.category)}</strong><span>${currency(item.used)} / ${currency(item.limit)}</span></div><div class="progress-track" role="progressbar" aria-label="${escapeHtml(item.category)} budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(item.progress))}"><div class="progress-fill ${item.status}" style="width:${Math.min(100, Math.max(0, item.progress))}%"></div></div><div class="progress-subtext">${item.remaining >= 0 ? `${currency(item.remaining)} remaining` : `${currency(Math.abs(item.remaining))} over limit`} · ${item.progress.toFixed(0)}%</div></div>`).join("");
  } else {
    root.innerHTML = items.slice(0, 3).map((goal) => goal.status === "unavailable"
      ? `<div class="goal-summary"><strong>${escapeHtml(goal.name)}</strong><span>${currency(goal.current)} / ${currency(goal.target)}</span><small class="progress-subtext">Goal progress unavailable because a required amount was not supplied.</small></div>`
      : `<div class="goal-summary"><strong>${escapeHtml(goal.name)}</strong><span>${currency(goal.current)} / ${currency(goal.target)}</span><div class="progress-track" role="progressbar" aria-label="${escapeHtml(goal.name)} goal progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(goal.progress)}"><div class="progress-fill" style="width:${goal.progress}%"></div></div><small class="progress-subtext">${currency(goal.remaining)} to go · ${Math.round(goal.progress)}%</small></div>`).join("");
  }
}
function renderInsightFacts(summary, transactions, insightResult) {
  const root = document.getElementById("dashboard-insights");
  const apiItems = rowsFrom(insightResult?.data, ["items", "insights"]);
  if (apiItems.length) {
    root.innerHTML = apiItems.slice(0, 4).map((item) => `<div class="insight-row"><span class="insight-marker" aria-hidden="true">${item.level === "warning" ? "!" : "•"}</span><p><strong>${escapeHtml(item.title || item.headline || "Insight")}</strong><br>${escapeHtml(item.description || item.message || item.body || "")}</p></div>`).join("");
    return;
  }
  const categoryTotals = Object.entries(summary.categoryTotals); const categoryComplete = categoryTotals.every(([, amount]) => amount !== null);
  const top = categoryComplete ? categoryTotals.sort((a, b) => b[1] - a[1])[0] : null;
  const facts = [];
  if (top) facts.push(`<strong>${escapeHtml(top[0])}</strong> is the largest recorded expense category this month (${currency(top[1])}).`);
  if (!categoryComplete) facts.push("Category totals are unavailable because the API did not supply one or more expense amounts.");
  if (summary.income !== null && summary.expenses !== null && summary.income > 0 && summary.savingsRate !== null) facts.push(`Recorded net savings are <strong>${currency(summary.savings)}</strong>, or ${summary.savingsRate.toFixed(1)}% of this month’s income.`);
  else if (summary.income === null || summary.expenses === null) facts.push("Monthly totals are unavailable because the API did not supply one or more transaction amounts.");
  if (summary.currentTransactions.length === 0 && transactions.length === 0) facts.push("Add transactions to see simple, transparent summaries here.");
  const warning = insightResult?.error && !DEMO_MODE ? `<div class="insight-row"><span class="insight-marker warning" aria-hidden="true">!</span><p><strong>Backend insight feed unavailable.</strong> ${escapeHtml(insightResult.error.message || "Retry from Analytics.")} Factual summaries below use only the dashboard records returned by the API.</p></div>` : "";
  root.innerHTML = warning + (facts.length ? facts.map((text) => `<div class="insight-row"><span class="insight-marker" aria-hidden="true">i</span><p>${text}</p></div>`).join("") : '<p class="panel-caption">No backend insight cards were returned. Simple summaries will appear when relevant records are available.</p>');
}
function renderRecurring(result) {
  const root = document.getElementById("dashboard-recurring");
  if (result.error) { root.innerHTML = `<p class="signal-message is-error">${escapeHtml(result.error.message || "Recurring data is unavailable.")}</p>`; return; }
  const rows = rowsFrom(result.data, ["items", "recurring", "recurringExpenses"]);
  if (!rows.length) { root.innerHTML = `<p class="signal-message">${DEMO_MODE ? "Repeated descriptions in sample records are shown on Analytics; no subscription status is inferred." : "No recurring-expense entries were returned by the analytics service."}</p><a class="small-link" href="./analytics.html">Open Analytics</a>`; return; }
  root.innerHTML = rows.slice(0, 2).map((row) => { const amount = toAmount(row.amount ?? row.monthlyAmount ?? row.totalRecorded); return `<div class="signal-row"><strong>${escapeHtml(row.name || row.description || row.merchant || "Recorded recurring item")}</strong><span>${DEMO_MODE ? `${Number(row.occurrences) || 0} repeats across ${Number(row.monthsObserved) || 0} observed months · not a verified subscription` : escapeHtml(row.frequency || row.period || "Frequency not supplied")}${amount !== null ? ` · ${currency(amount)}` : ""}</span></div>`; }).join("");
}
function renderAnomalies(result) {
  const root = document.getElementById("dashboard-anomalies");
  if (result.error) { root.innerHTML = `<p class="signal-message is-error">${escapeHtml(result.error.message || "Anomaly data is unavailable.")}</p>`; return; }
  if (result.data?.available === false) { root.innerHTML = '<p class="signal-message">Anomaly detection is not supplied by the demo data.</p><a class="small-link" href="./analytics.html">See data availability</a>'; return; }
  const rows = rowsFrom(result.data, ["items", "anomalies", "alerts"]);
  if (!rows.length) { root.innerHTML = `<p class="signal-message">${DEMO_MODE ? "No anomaly analysis is simulated in demo mode." : "The service returned no anomaly details for this view."}</p>`; return; }
  root.innerHTML = rows.slice(0, 2).map((row) => { const amount = toAmount(row.amount); return `<div class="signal-row"><strong>${escapeHtml(row.title || row.description || row.merchant || "Review item")}</strong><span>${escapeHtml(row.message || row.reason || row.category || "Details supplied by analytics")}${amount !== null ? ` · ${currency(amount)}` : ""}</span></div>`; }).join("");
}
function renderForecast(result) {
  const root = document.getElementById("dashboard-forecast");
  if (result.error) { root.innerHTML = `<p class="signal-message is-error">${escapeHtml(result.error.message || "Forecast data is unavailable.")}</p>`; return; }
  if (result.data?.available === false) { root.innerHTML = '<p class="signal-message">Forecast data is not simulated for the demo account.</p><a class="small-link" href="./analytics.html">Open Analytics</a>'; return; }
  const rows = rowsFrom(result.data, ["months", "items", "forecast", "projections"]);
  const balance = result.data?.cashFlow ?? result.data?.projectedBalance ?? result.data?.closingBalance;
  if (!rows.length && toAmount(balance) === null) { root.innerHTML = `<p class="signal-message">${DEMO_MODE ? "No forecast is available in demo mode." : "No forecast values were supplied by the service."}</p>`; return; }
  if (!rows.length) { root.innerHTML = `<div class="signal-row"><strong>Supplied projection</strong><span>${currency(balance)}</span></div>`; return; }
  root.innerHTML = rows.slice(0, 2).map((row) => { const amount = toAmount(row.balance ?? row.amount ?? row.cashFlow ?? row.projectedBalance); return `<div class="signal-row"><strong>${escapeHtml(row.label || row.month || row.period || "Forecast")}</strong><span>${amount !== null ? currency(amount) : escapeHtml(row.summary || "Value not supplied")}</span></div>`; }).join("");
}
function renderHealth(result) {
  const root = document.getElementById("dashboard-health");
  if (result.error) { root.innerHTML = `<p class="signal-message is-error">${escapeHtml(result.error.message || "Health metrics are unavailable.")}</p>`; return; }
  if (result.data?.available === false) { root.innerHTML = '<p class="signal-message">No health score is generated for the demo account.</p><a class="small-link" href="./analytics.html">Explore Analytics</a>'; return; }
  const metrics = rowsFrom(result.data, ["metrics", "items", "indicators"]);
  const score = result.data?.score ?? result.data?.healthScore;
  if (score !== null && score !== undefined && score !== "" && Number.isFinite(Number(score))) root.innerHTML = `<div class="health-score"><strong>${escapeHtml(score)}</strong><span>${escapeHtml(result.data?.label || result.data?.status || "Score supplied by service")}</span></div>`;
  else if (metrics.length) root.innerHTML = metrics.slice(0, 2).map((item) => `<div class="signal-row"><strong>${escapeHtml(item.label || item.name || "Metric")}</strong><span>${escapeHtml(item.value ?? item.status ?? item.description ?? "Value not supplied")}</span></div>`).join("");
  else root.innerHTML = `<p class="signal-message">${DEMO_MODE ? "No health score is generated for the demo account." : "No health metrics were supplied by the service."}</p>`;
}
function render(summary, transactions, insightPayload, analyticsResults) {
  setText("dashboard-date", monthLabel());
  setText("dashboard-greeting", `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${getDisplayName(getCurrentUser())}.`);
  setText("metric-income", currency(summary.income)); setComparison("metric-income-note", summary.incomeChange, true);
  setText("metric-expenses", currency(summary.expenses)); setComparison("metric-expenses-note", summary.expenseChange, false);
  setText("metric-savings", currency(summary.savings)); setComparison("metric-savings-note", summary.savingsChange, true);
  setText("metric-rate", summary.savingsRate === null ? "—" : `${summary.savingsRate.toFixed(1)}%`); setComparison("metric-rate-note", summary.savingsRateChange, true, "% relative");
  const recent = summary.recentTransactions; const body = document.getElementById("recent-transactions");
  body.innerHTML = recent.map((row) => { const amount = toAmount(row.amount); return `<tr><td class="transaction-name">${escapeHtml(row.description)}</td><td><span class="category-chip">${escapeHtml(row.category)}</span></td><td>${dateLabel(row.date, { month: "short", day: "numeric" })}</td><td class="align-right ${amount === null ? "" : row.type === "income" ? "amount-positive" : "amount-negative"}">${amount === null ? "Amount unavailable" : `${row.type === "income" ? "+" : "−"}${currency(amount, 2)}`}</td></tr>`; }).join("");
  document.getElementById("transactions-empty").classList.toggle("hidden", recent.length > 0);
  renderInsightFacts(summary, transactions, insightPayload);
  renderProgressItems(document.getElementById("dashboard-budgets"), summary.budgetStatus, "budget");
  renderProgressItems(document.getElementById("dashboard-goals"), summary.goalStatus, "goal");
  renderCharts(summary);
  renderRecurring(analyticsResults.recurring); renderAnomalies(analyticsResults.anomalies); renderForecast(analyticsResults.forecast); renderHealth(analyticsResults.health);
}
async function load() {
  main.setAttribute("aria-busy", "true"); setPageLoading(true);
  clearPageError(errorBox);
  try {
    const base = await dataService.dashboard();
    const transactions = normalizeItems(base?.transactions);
    const budgets = normalizeItems(base?.budgets);
    const goals = normalizeItems(base?.goals);
    const summary = calculateDashboard(transactions, budgets, goals);
    const [insights, recurring, anomalies, forecast, health] = await Promise.all([
      safe(dataService.insights()), safe(dataService.analyticsRecurring()), safe(dataService.analyticsAnomalies()), safe(dataService.analyticsForecast()), safe(dataService.analyticsHealth())
    ]);
    render(summary, transactions, insights, { recurring, anomalies, forecast, health });
  } catch (error) {
    notify(error.message || "Unable to load dashboard data.", { title: "Dashboard unavailable", type: "error" });
    showPageError(errorBox, error.message || "The dashboard could not be loaded.", load);
  } finally { main.removeAttribute("aria-busy"); setPageLoading(false); }
}
load();
