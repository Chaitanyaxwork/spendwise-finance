import { dataService, DEMO_MODE } from "./data-service.js";
import { escapeHtml, currency, mountAppShell, setBusy, setPageLoading } from "./shared.js";
import { toAmount } from "./calculations.js";

mountAppShell();
const $ = (selector) => document.querySelector(selector);
const main = document.getElementById("page-main");
const palette = ["#1f6b64", "#d3a25a", "#4f7f9a", "#b8655a", "#9aa96b", "#7d7ba3", "#6fb0a0", "#c48b5c"];
let monthlyChart; let trendChart; let categoryChart; let latestMonthly = null; let currentMonthlyPayload = null; let currentTrendPayload = null;
const safe = async (promise) => { try { return { data: await promise, error: null }; } catch (error) { return { data: null, error }; } };
const rowsFrom = (payload, keys = ["items", "months", "series", "results"]) => {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
};
const numberOrNull = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const firstNumber = (row, keys) => { for (const key of keys) { const value = numberOrNull(row?.[key]); if (value !== null) return value; } return null; };
function reportForDisplay(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => reportForDisplay(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, reportForDisplay(child, childKey)]));
  const monetary = /amount|income|expense|net|saving|balance|cash.?flow|contribution|target|current|remaining|limit|spent|spend|projected|recorded|total/i.test(key);
  const nonMoney = /(?:rate|score|percent(?:age)?|count|months?|years?|days?|date|id|period|index)$/i.test(key);
  if (monetary && !nonMoney && (value === null || value === undefined || value === "")) return "Not supplied";
  const amount = toAmount(value);
  return monetary && !nonMoney && amount !== null ? currency(amount, 2) : value;
}
function dateKey(row) {
  const raw = String(row.month ?? row.period ?? row.month_key ?? row.monthKey ?? row.date ?? row.key ?? "");
  const match = raw.match(/(\d{4})[-/](\d{1,2})/);
  return match ? `${match[1]}-${String(match[2]).padStart(2, "0")}` : raw;
}
function labelFor(row, key) {
  if (row.label || row.monthLabel || row.month_label) return String(row.label || row.monthLabel || row.month_label);
  const match = key.match(/^(\d{4})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) : key || "Period";
}
function normalizeMonths(payload) {
  return rowsFrom(payload, ["months", "items", "series", "monthly", "results"]).map((row) => {
    const key = dateKey(row);
    const income = firstNumber(row, ["income", "totalIncome", "total_income", "income_total", "credits"]);
    const expenses = firstNumber(row, ["expenses", "expense", "totalExpenses", "total_expenses", "expense_total", "debits"]);
    const net = firstNumber(row, ["netSavings", "net_savings", "net", "savings"]) ?? (income !== null && expenses !== null ? income - expenses : null);
    const savingsRate = firstNumber(row, ["savingsRate", "savings_rate", "savingsRatePercent", "savings_rate_percent"]) ?? (income > 0 && net !== null ? net / income * 100 : null);
    return { key, label: labelFor(row, key), income, expenses, net, savingsRate, raw: row };
  });
}
function deltaText(current, previous, favorableUp = true, unit = "%") {
  if (current === null || previous === null || previous === 0) return "No previous-month comparison";
  const delta = (current - previous) / Math.abs(previous) * 100;
  if (Math.abs(delta) < 0.05) return "About the same as last month";
  const positive = delta > 0 ? favorableUp : !favorableUp;
  return `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}${unit} vs last month · ${positive ? "favorable" : "review"}`;
}
function setText(id, value) { const node = document.getElementById(id); if (node) node.textContent = value; }
function comparison(id, current, previous, favorableUp = true) {
  const node = document.getElementById(id); if (!node) return;
  if (current === null || previous === null || previous === 0) { node.textContent = "No previous-month comparison"; node.classList.remove("is-positive", "is-negative"); return; }
  const change = (current - previous) / Math.abs(previous) * 100;
  node.textContent = deltaText(current, previous, favorableUp);
  node.classList.toggle("is-positive", Math.abs(change) >= .05 && (change > 0 ? favorableUp : !favorableUp));
  node.classList.toggle("is-negative", Math.abs(change) >= .05 && (change > 0 ? !favorableUp : favorableUp));
}
function stateFor(canvasId, stateId, message, retry) {
  const state = document.getElementById(stateId); const canvas = document.getElementById(canvasId);
  if (!state) return;
  state.hidden = false; state.className = "panel-state is-error";
  state.innerHTML = `<p>${escapeHtml(message)}</p><button class="button button-quiet button-small" type="button">Try again</button>`;
  state.querySelector("button").addEventListener("click", retry);
  if (canvas?.parentElement) canvas.parentElement.hidden = true;
}
function clearState(canvasId, stateId) {
  const state = document.getElementById(stateId); const canvas = document.getElementById(canvasId);
  if (state) { state.hidden = true; state.replaceChildren(); }
  if (canvas?.parentElement) canvas.parentElement.hidden = false;
}
function axisOptions() {
  return { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 16, color: "#526666", font: { size: 12 } } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label || context.label}: ${currency(context.parsed.y ?? context.parsed, 0)}` } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#657878", font: { size: 12 } } }, y: { beginAtZero: true, grid: { color: "#e4eae6" }, border: { display: false }, ticks: { color: "#657878", font: { size: 12 }, callback: (value) => currency(value, 0) } } } };
}
function renderMetrics(months) {
  latestMonthly = months.at(-1) || null; const previous = months.at(-2) || null;
  if (!latestMonthly) {
    ["analytics-income", "analytics-expenses", "analytics-net", "analytics-rate"].forEach((id) => setText(id, "Not supplied"));
    ["analytics-income-change", "analytics-expense-change", "analytics-net-change", "analytics-rate-change"].forEach((id) => setText(id, "No monthly rows returned"));
    return;
  }
  setText("analytics-income", latestMonthly.income === null ? "Not supplied" : currency(latestMonthly.income));
  setText("analytics-expenses", latestMonthly.expenses === null ? "Not supplied" : currency(latestMonthly.expenses));
  setText("analytics-net", latestMonthly.net === null ? "Not supplied" : currency(latestMonthly.net));
  setText("analytics-rate", latestMonthly.savingsRate === null ? "Not supplied" : `${latestMonthly.savingsRate.toFixed(1)}%`);
  comparison("analytics-income-change", latestMonthly.income, previous?.income ?? null, true);
  comparison("analytics-expense-change", latestMonthly.expenses, previous?.expenses ?? null, false);
  comparison("analytics-net-change", latestMonthly.net, previous?.net ?? null, true);
  comparison("analytics-rate-change", latestMonthly.savingsRate, previous?.savingsRate ?? null, true);
  setText("analytics-monthly-caption", months.length ? `${months[0].label} – ${months.at(-1).label}` : "Monthly data");
}
function renderMonthly(result) {
  const canvasId = "analytics-monthly-chart"; const stateId = "monthly-chart-state";
  if (result.error) { stateFor(canvasId, stateId, result.error.message || "Monthly analytics could not be loaded.", loadMonthly); return; }
  const months = normalizeMonths(result.data); currentMonthlyPayload = result.data;
  if (!months.length) { renderMetrics([]); stateFor(canvasId, stateId, "The monthly analytics endpoint returned no monthly rows.", loadMonthly); return; }
  renderMetrics(months);
  if (months.some((item) => item.income === null || item.expenses === null)) { stateFor(canvasId, stateId, "Monthly totals are unavailable because one or more income or expense amounts were not supplied.", loadMonthly); return; }
  if (!window.Chart) { stateFor(canvasId, stateId, "Chart.js could not load. Reconnect and retry to display this chart.", loadMonthly); return; }
  clearState(canvasId, stateId); monthlyChart?.destroy();
  monthlyChart = new Chart(document.getElementById(canvasId), { type: "bar", data: { labels: months.map((item) => item.label), datasets: [{ label: "Income", data: months.map((item) => item.income), backgroundColor: "#2e7d6e", borderRadius: 6, maxBarThickness: 25 }, { label: "Expenses", data: months.map((item) => item.expenses), backgroundColor: "#d6a765", borderRadius: 6, maxBarThickness: 25 }] }, options: axisOptions() });
}
function seriesValues(row, months) {
  const raw = row.values ?? row.series ?? row.trend ?? row.data ?? row.months;
  if (Array.isArray(raw)) {
    const map = new Map();
    raw.forEach((entry, index) => {
      if (entry && typeof entry === "object") map.set(dateKey(entry) || months[index]?.key, firstNumber(entry, ["amount", "expenses", "expense", "value", "total"]));
      else map.set(months[index]?.key, numberOrNull(entry));
    });
    return months.map((month) => map.get(month.key) ?? null);
  }
  if (raw && typeof raw === "object") return months.map((month) => numberOrNull(raw[month.key] ?? raw[month.label]));
  return [];
}
function categorySeries(payload, months) {
  let raw = payload?.categoryTrends ?? payload?.category_trends ?? payload?.categories ?? payload?.categorySeries;
  if (!raw && currentMonthlyPayload) {
    const latest = normalizeMonths(currentMonthlyPayload).at(-1)?.raw;
    raw = latest?.categoryTrends ?? latest?.category_trends ?? latest?.categories ?? latest?.categoryTotals;
  }
  if (Array.isArray(raw)) return raw.map((row) => ({ name: String(row.category ?? row.name ?? row.label ?? "Category"), values: seriesValues(row, months) })).filter((row) => row.values.length);
  if (raw && typeof raw === "object") return Object.entries(raw).map(([name, value]) => ({ name, values: seriesValues({ values: value }, months) })).filter((row) => row.values.length);
  return [];
}
async function loadMonthly() { const result = await safe(dataService.analyticsMonthly()); renderMonthly(result); }
async function loadTrends() {
  const count = Number($("#trend-period").value || 6); const result = await safe(dataService.analyticsTrends(count)); currentTrendPayload = result.data;
  if (result.error) { stateFor("analytics-trend-chart", "trend-chart-state", result.error.message || "Trend analytics could not be loaded.", loadTrends); setText("analytics-trend-caption", `Last ${count} months`); setCategoryState("Trend data could not be loaded.", loadTrends); return; }
  const months = normalizeMonths(result.data);
  setText("analytics-trend-caption", `Last ${count} months`);
  if (!months.length) {
    stateFor("analytics-trend-chart", "trend-chart-state", "The trends endpoint returned no monthly rows.", loadTrends);
    setCategoryState("No category trend data was returned by the service.", loadTrends); return;
  }
  if (months.some((item) => item.expenses === null)) {
    stateFor("analytics-trend-chart", "trend-chart-state", "The spending trend is unavailable because one or more monthly expense amounts were not supplied.", loadTrends);
    renderCategoryTrend(result.data, months); return;
  }
  if (!window.Chart) { stateFor("analytics-trend-chart", "trend-chart-state", "Chart.js could not load. Reconnect and retry to display this chart.", loadTrends); setCategoryState("Chart.js could not load.", loadTrends); return; }
  clearState("analytics-trend-chart", "trend-chart-state"); trendChart?.destroy();
  trendChart = new Chart(document.getElementById("analytics-trend-chart"), { type: "line", data: { labels: months.map((item) => item.label), datasets: [{ label: "Expenses", data: months.map((item) => item.expenses), borderColor: "#236b66", backgroundColor: "rgba(35,107,102,.09)", fill: true, tension: .32, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 }] }, options: { ...axisOptions(), plugins: { ...axisOptions().plugins, legend: { display: false } } } });
  renderCategoryTrend(result.data, months);
}
function setCategoryState(message, retry = loadTrends) {
  stateFor("analytics-category-chart", "category-chart-state", message, retry);
  const legend = document.getElementById("analytics-category-legend"); if (legend) legend.innerHTML = "";
}
function renderCategoryTrend(payload, months) {
  const suppliedSeries = categorySeries(payload, months);
  if (suppliedSeries.some((item) => item.values.some((value) => value === null))) { setCategoryState("Category trends are unavailable because one or more monthly amounts were not supplied."); return; }
  const series = suppliedSeries.filter((item) => item.values.some((value) => value !== null));
  if (!series.length) { setCategoryState("No month-by-month category trend series were supplied."); return; }
  if (!window.Chart) { setCategoryState("Chart.js could not load."); return; }
  clearState("analytics-category-chart", "category-chart-state"); categoryChart?.destroy();
  const datasets = series.slice(0, 8).map((item, index) => ({ label: item.name, data: item.values, borderColor: palette[index], backgroundColor: palette[index], tension: .3, pointRadius: 2, pointHoverRadius: 4, borderWidth: 2 }));
  categoryChart = new Chart(document.getElementById("analytics-category-chart"), { type: "line", data: { labels: months.map((item) => item.label), datasets }, options: axisOptions() });
  document.getElementById("analytics-category-legend").innerHTML = datasets.map((item) => `<span><i style="background:${item.borderColor}"></i>${escapeHtml(item.label)}</span>`).join("");
}
function showRetry(root, message, retry) {
  root.innerHTML = `<div class="signal-empty"><p>${escapeHtml(message)}</p><button class="button button-quiet button-small" type="button">Try again</button></div>`;
  root.querySelector("button")?.addEventListener("click", retry);
}
function renderRecurring(result) {
  const root = $("#recurring-list");
  if (result.error) { showRetry(root, result.error.message || "Recurring expenses could not be loaded.", loadRecurring); return; }
  if (result.data?.available === false) { root.innerHTML = '<p class="signal-message">Recurring service data is not available in this demo. Repeated descriptions are not verified subscriptions.</p>'; return; }
  const rows = rowsFrom(result.data, ["items", "recurring", "recurringExpenses", "recurring_expenses"]);
  if (!rows.length) { root.innerHTML = `<p class="signal-message">${DEMO_MODE ? "No repeat observations are available in the sample records." : "No recurring-expense rows were returned by the service."}</p>`; return; }
  root.innerHTML = rows.slice(0, 8).map((row) => `<div class="analytic-list-row"><div><strong>${escapeHtml(row.name || row.description || row.merchant || "Recurring item")}</strong><small>${escapeHtml(DEMO_MODE ? `${row.occurrences || 0} recorded repeats across ${row.monthsObserved || 0} months; not a verified subscription.` : row.frequency || row.period || (row.occurrences ? `${row.occurrences} recorded occurrences` : "Frequency not supplied"))}</small></div><span>${numberOrNull(row.amount ?? row.monthlyAmount ?? row.monthly_amount ?? (DEMO_MODE ? row.totalRecorded : null)) === null ? "—" : currency(row.amount ?? row.monthlyAmount ?? row.monthly_amount ?? row.totalRecorded)}</span></div>`).join("");
}
async function loadRecurring() { renderRecurring(await safe(dataService.analyticsRecurring())); }
function renderAnomalies(result) {
  const root = $("#anomalies-list");
  if (result.error) { showRetry(root, result.error.message || "Anomaly analytics could not be loaded.", loadAnomalies); return; }
  if (result.data?.available === false) { root.innerHTML = '<p class="signal-message">Anomaly detection is not simulated in demo mode.</p>'; return; }
  const rows = rowsFrom(result.data, ["items", "anomalies", "alerts"]);
  if (!rows.length) { root.innerHTML = `<p class="signal-message">${DEMO_MODE ? "No anomaly analysis is generated for the sample account." : "The service returned no anomaly details for this period."}</p>`; return; }
  root.innerHTML = rows.slice(0, 6).map((row) => `<div class="analytic-list-row is-warning"><div><strong>${escapeHtml(row.title || row.description || row.merchant || "Review item")}</strong><small>${escapeHtml(row.reason || row.message || row.category || "Reason not supplied")}</small></div><span>${numberOrNull(row.amount) === null ? "" : currency(row.amount)}</span></div>`).join("");
}
async function loadAnomalies() { renderAnomalies(await safe(dataService.analyticsAnomalies())); }
function renderForecast(result) {
  const root = $("#forecast-list");
  if (result.error) { showRetry(root, result.error.message || "Cash-flow forecast could not be loaded.", loadForecast); return; }
  if (result.data?.available === false) { root.innerHTML = '<p class="signal-message">A forecast is not simulated in demo mode.</p>'; return; }
  const rows = rowsFrom(result.data, ["months", "items", "forecast", "projections"]); const single = firstNumber(result.data, ["projectedBalance", "projected_balance", "cashFlow", "cash_flow"]);
  if (!rows.length && single === null) { root.innerHTML = `<p class="signal-message">${DEMO_MODE ? "No forecast is generated for the demo account." : "No forecast values were supplied by the service."}</p>`; return; }
  if (!rows.length) { root.innerHTML = `<div class="analytic-list-row"><div><strong>Supplied projection</strong><small>Value returned by analytics API</small></div><span>${currency(single)}</span></div>`; return; }
  root.innerHTML = rows.slice(0, 8).map((row) => { const value = firstNumber(row, ["balance", "amount", "cashFlow", "cash_flow", "projectedBalance", "projected_balance"]); return `<div class="analytic-list-row"><div><strong>${escapeHtml(row.label || row.month || row.period || "Forecast period")}</strong><small>${escapeHtml(row.summary || row.description || "Supplied forecast value")}</small></div><span>${value === null ? "—" : currency(value)}</span></div>`; }).join("");
}
async function loadForecast() { renderForecast(await safe(dataService.analyticsForecast())); }
function renderHealth(result) {
  const root = $("#health-list");
  if (result.error) { showRetry(root, result.error.message || "Health metrics could not be loaded.", loadHealth); return; }
  if (result.data?.available === false) { root.innerHTML = '<p class="signal-message">Financial health scoring is not simulated in demo mode.</p>'; return; }
  const metrics = rowsFrom(result.data, ["metrics", "items", "indicators"]); const score = firstNumber(result.data, ["score", "healthScore", "health_score"]);
  if (score !== null) root.innerHTML = `<div class="health-score"><strong>${escapeHtml(score)}</strong><span>${escapeHtml(result.data?.label || result.data?.status || "Score supplied by analytics API")}</span></div>`;
  else if (metrics.length) root.innerHTML = metrics.slice(0, 8).map((item) => `<div class="analytic-list-row"><div><strong>${escapeHtml(item.label || item.name || "Metric")}</strong><small>${escapeHtml(item.description || item.status || "")}</small></div><span>${escapeHtml(item.value ?? "—")}</span></div>`).join("");
  else root.innerHTML = `<p class="signal-message">${DEMO_MODE ? "No health score is generated for demo data." : "No health metrics were supplied by the service."}</p>`;
}
async function loadHealth() { renderHealth(await safe(dataService.analyticsHealth())); }
async function loadReport() {
  const resultNode = $("#report-result"); const buttons = [$("#generate-report"), $("#generate-report-secondary")].filter(Boolean);
  buttons.forEach((button) => setBusy(button, true, "Generating…")); resultNode.innerHTML = '<p class="panel-caption">Requesting a report from the analytics service…</p>';
  try {
    const report = await dataService.analyticsReport();
    if (!report || typeof report !== "object") { resultNode.innerHTML = '<p class="panel-caption">The analytics service returned no report data.</p>'; return; }
    const json = JSON.stringify(report, null, 2); const displayJson = JSON.stringify(reportForDisplay(report), null, 2);
    resultNode.innerHTML = `<div class="report-result-head"><div><strong>${escapeHtml(report.title || "Analytics report")}</strong><small>${escapeHtml(report.generatedAt || report.generated_at || "Generated by the connected analytics service")}</small></div><button class="button button-secondary button-small" type="button" id="download-report">Download JSON</button></div><pre class="report-json">${escapeHtml(displayJson)}</pre>`;
    $("#download-report").addEventListener("click", () => { const blob = new Blob([json], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `spendwise-analytics-${new Date().toISOString().slice(0, 10)}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); });
  } catch (error) { showRetry(resultNode, error.message || "The analytics report could not be generated.", loadReport); }
  finally { buttons.forEach((button) => setBusy(button, false)); }
}
$("#trend-period").addEventListener("change", loadTrends);
$("#generate-report").addEventListener("click", loadReport); $("#generate-report-secondary").addEventListener("click", loadReport);
async function load() {
  main.setAttribute("aria-busy", "true"); setPageLoading(true);
  const [monthly, recurring, anomalies, forecast, health] = await Promise.all([
    safe(dataService.analyticsMonthly()), safe(dataService.analyticsRecurring()), safe(dataService.analyticsAnomalies()), safe(dataService.analyticsForecast()), safe(dataService.analyticsHealth())
  ]);
  renderMonthly(monthly); renderRecurring(recurring); renderAnomalies(anomalies); renderForecast(forecast); renderHealth(health);
  await loadTrends();
  main.removeAttribute("aria-busy"); setPageLoading(false);
}
load();
