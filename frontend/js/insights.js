import { normalizeItems } from "./api.js";
import { dataService, DEMO_MODE } from "./data-service.js";
import { calculateDashboard, deriveInsights, currentMonthKey, toAmount } from "./calculations.js";
import { clearPageError, createPageError, currency, escapeHtml, mountAppShell, setPageLoading, showPageError } from "./shared.js";

mountAppShell();
const $ = (selector) => document.querySelector(selector); const main = document.getElementById("page-main"); const pageError = createPageError(main);
let trendChart;
const glyph = { spending: "↘", savings: "◈", budget: "◎", recurring: "↻", anomalies: "!", cashflow: "⌁" };
const safe = async (promise) => { try { return { data: await promise, error: null }; } catch (error) { return { data: null, error }; } };
const rowsFrom = (payload, keys = ["items", "insights", "alerts", "anomalies", "recurring", "months", "forecast"]) => {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
};
function categoryFor(item) {
  const value = String(item.category || item.type || item.kind || item.group || "spending").toLowerCase();
  if (value.includes("saving")) return "savings";
  if (value.includes("budget")) return "budget";
  if (value.includes("recurr")) return "recurring";
  if (value.includes("anomal") || value.includes("unusual")) return "anomalies";
  if (value.includes("cash") || value.includes("forecast")) return "cashflow";
  return "spending";
}
function insightCard({ category, title, body, level = "info", source = "Recorded activity" }) {
  const tone = ["warning", "danger"].includes(String(level).toLowerCase()) ? String(level).toLowerCase() : "";
  return `<article class="insight-card${tone ? ` ${tone}` : ""}"><div class="insight-card-head"><span class="insight-card-icon" aria-hidden="true">${glyph[category] || "i"}</span><span>${escapeHtml(source)}</span></div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`;
}
function renderCards(root, cards, emptyText) {
  root.innerHTML = cards.length ? cards.map(insightCard).join("") : insightCard({ category: "spending", title: "Nothing to show yet", body: emptyText, source: "Information" });
}
function buildDemoFacts(summary) {
  const cards = [];
  const categoryTotals = Object.entries(summary.categoryTotals); const categoryComplete = categoryTotals.every(([, amount]) => amount !== null);
  const top = categoryComplete ? categoryTotals.sort((a, b) => b[1] - a[1])[0] : null;
  if (top) cards.push({ category: "spending", title: "Largest recorded category", body: `${top[0]} accounts for ${currency(top[1])} of expense transactions this month.`, source: "Calculated from this month’s records" });
  else if (!categoryComplete) cards.push({ category: "spending", title: "Category totals unavailable", body: "The API did not supply an amount for one or more expense transactions, so a largest category cannot be determined.", level: "warning", source: "Data availability" });
  else cards.push({ category: "spending", title: "Spending summary", body: "No expense records are available for the current month.", source: "Recorded activity" });
  if (summary.income !== null && summary.expenses !== null && summary.income > 0 && summary.savingsRate !== null) cards.push({ category: "savings", title: "Recorded net savings", body: `${currency(summary.savings)} remains after recorded expenses, equal to ${summary.savingsRate.toFixed(1)}% of recorded income.`, source: "Calculated from this month’s records" });
  else if (summary.income === null || summary.expenses === null) cards.push({ category: "savings", title: "Monthly totals unavailable", body: "The API did not supply one or more transaction amounts required for this calculation.", level: "warning", source: "Data availability" });
  else cards.push({ category: "savings", title: "Savings rate", body: "Add recorded income and expense transactions to calculate a savings rate.", source: "Information" });
  return cards;
}
function renderBudgetCards(summary, backendItems) {
  if (backendItems.length) return backendItems.filter((item) => categoryFor(item) === "budget").map((item) => backendCard(item, "budget"));
  if (!summary.budgetStatus.length) return [insightCard({ category: "budget", title: "No budgets yet", body: "Add a monthly category budget to see recorded usage against your plan.", source: "Information" })];
  const insights = deriveInsights(summary.currentTransactions, summary.budgetStatus);
  const warnings = insights.budgetWarnings;
  const cards = [];
  if (summary.budgetStatus.some((item) => item.status === "unavailable")) cards.push(insightCard({ category: "budget", title: "Some budget progress is unavailable", body: "A required budget limit or transaction amount was not supplied, so those categories cannot be assessed against the 80% indicator.", level: "warning", source: "Data availability" }));
  if (warnings.length) cards.push(...warnings.slice(0, 4).map((item) => insightCard({ category: "budget", title: `${item.category} · ${Math.round(item.progress)}% used`, body: item.remaining >= 0 ? `${currency(item.used)} spent; ${currency(item.remaining)} remains against the ${currency(item.limit)} limit.` : `${currency(item.used)} spent; ${currency(Math.abs(item.remaining))} above the ${currency(item.limit)} limit.`, level: item.status === "danger" ? "danger" : "warning", source: "Budget indicator" })));
  else if (!summary.budgetStatus.some((item) => item.status === "unavailable")) cards.push(insightCard({ category: "budget", title: "Budget progress", body: "None of the tracked categories have reached the 80% approaching-limit indicator this month.", source: "Calculated from current budgets" }));
  return cards;
}
function backendCard(item, category) {
  const body = item.description || item.message || item.body || item.detail || "Details were supplied by the connected insights service.";
  const amountValue = toAmount(item.amount); const amount = amountValue === null ? "" : ` · ${currency(amountValue)}`;
  return { category, title: item.title || item.headline || item.name || item.label || "Financial insight", body: `${body}${amount}`, level: item.level || item.severity || "info", source: "Connected analytics service" };
}
function signalCards(category, result, backendItems) {
  const supplied = backendItems.filter((item) => categoryFor(item) === category);
  if (supplied.length) return supplied.slice(0, 4).map((item) => backendCard(item, category));
  if (result.error) return [insightCard({ category, title: "Service data unavailable", body: result.error.message || `The ${category} endpoint could not be loaded.`, level: "warning", source: "Retry available in Analytics" })];
  const data = result.data;
  if (data?.available === false) return [insightCard({ category, title: category === "anomalies" ? "Anomaly detection not available" : category === "cashflow" ? "Forecast not available" : "Analytics not available", body: DEMO_MODE ? "This analysis is not simulated from demo records." : "The connected service marked this analysis unavailable.", source: "Availability" })];
  const rows = rowsFrom(data, category === "recurring" ? ["items", "recurring", "recurringExpenses", "recurring_expenses"] : category === "anomalies" ? ["items", "anomalies", "alerts"] : ["months", "items", "forecast", "projections"]);
  if (!rows.length) {
    if (category === "recurring" && DEMO_MODE) {
      const demoCandidates = data?.items || [];
      if (demoCandidates.length) return demoCandidates.slice(0, 4).map((item) => { const total = toAmount(item.totalRecorded); return insightCard({ category, title: item.name || "Repeated description", body: `${item.occurrences} occurrences across ${item.monthsObserved} observed months; ${total === null ? "recorded total unavailable" : `${currency(total)} recorded total`}. This is a repeat observation, not a verified subscription.`, source: "Demo record observation" }); });
    }
    return [insightCard({ category, title: "No detail supplied", body: category === "anomalies" ? "No anomaly analysis was supplied; the app does not infer unusual spending from a guessed threshold." : category === "cashflow" ? "No cash-flow forecast values were supplied by the service." : "No recurring-expense rows were supplied by the service.", source: "Availability" })];
  }
  return rows.slice(0, 4).map((item) => {
    const amount = item.amount ?? item.monthlyAmount ?? item.projectedBalance ?? item.cashFlow;
    const amountValue = toAmount(amount); const value = amountValue === null ? "" : ` · ${currency(amountValue)}`;
    const observations = item.occurrences && !(category === "recurring" && DEMO_MODE) ? ` · ${item.occurrences} recorded occurrences` : "";
    const recurringNote = category === "recurring" && DEMO_MODE ? ` ${Number(item.occurrences) || 0} recorded repeats across ${Number(item.monthsObserved) || 0} months; this is not a verified subscription.` : "";
    const totalRecorded = toAmount(item.totalRecorded); const recordedTotal = category === "recurring" && DEMO_MODE && totalRecorded !== null ? ` · ${currency(totalRecorded)} recorded total` : "";
    return insightCard({ category, title: item.title || item.name || item.description || item.merchant || item.month || item.label || "Analytics detail", body: `${item.message || item.reason || item.summary || item.description || item.classification || item.frequency || "Value supplied by connected analytics"}${value}${observations}${recurringNote}${recordedTotal}`, level: category === "anomalies" ? (item.level || item.severity || "warning") : item.level || "info", source: DEMO_MODE ? "Demo record observation" : "Connected analytics service" });
  });
}
function normalizeTrend(payload) {
  const rows = rowsFrom(payload, ["months", "items", "series", "results"]);
  return rows.map((row) => ({ month: String(row.month || row.period || row.key || row.date || row.label || ""), expenses: toAmount(row.expenses ?? row.expense ?? row.totalExpenses ?? row.total_expenses ?? row.amount) })).filter((row) => row.month);
}
function showChartState(message, retry) {
  const state = $("#insight-chart-state"); state.hidden = false; state.className = "panel-state is-error"; state.innerHTML = `<p>${escapeHtml(message)}</p><button class="button button-quiet button-small" type="button">Try again</button>`; state.querySelector("button").addEventListener("click", retry); $("#insight-trend-chart").parentElement.hidden = true;
}
function renderChart(result) {
  if (result.error) { showChartState(result.error.message || "Monthly trend could not be loaded.", loadTrend); return; }
  const months = normalizeTrend(result.data);
  if (!months.length) { showChartState("The trend endpoint did not supply monthly expense values.", loadTrend); return; }
  if (months.some((item) => item.expenses === null)) { showChartState("The trend chart is unavailable because one or more monthly expense amounts were not supplied.", loadTrend); return; }
  if (!window.Chart) { showChartState("Chart.js could not load. Reconnect and retry to display this chart.", loadTrend); return; }
  const state = $("#insight-chart-state"); state.hidden = true; state.replaceChildren(); $("#insight-trend-chart").parentElement.hidden = false;
  trendChart?.destroy();
  trendChart = new Chart(document.getElementById("insight-trend-chart"), { type: "line", data: { labels: months.slice(-12).map((item) => { const match = item.month.match(/^(\d{4})-(\d{2})$/); return match ? new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) : item.month; }), datasets: [{ label: "Recorded expenses", data: months.slice(-12).map((item) => item.expenses), borderColor: "#236b66", backgroundColor: "rgba(35,107,102,.09)", fill: true, tension: .35, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => currency(context.parsed.y, 0) } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#657878", font: { size: 12 } } }, y: { beginAtZero: true, grid: { color: "#e4eae6" }, border: { display: false }, ticks: { color: "#657878", font: { size: 12 }, callback: (value) => currency(value, 0) } } } } });
}
async function loadTrend() { renderChart(await safe(dataService.analyticsTrends(12))); }
async function load() {
  main.setAttribute("aria-busy", "true"); setPageLoading(true); clearPageError(pageError);
  try {
    const [dashboard, insightResult, recurring, anomalies, forecast, trend] = await Promise.all([
      safe(dataService.dashboard()), safe(dataService.insights()), safe(dataService.analyticsRecurring()), safe(dataService.analyticsAnomalies()), safe(dataService.analyticsForecast()), safe(dataService.analyticsTrends(12))
    ]);
    if (dashboard.error) throw dashboard.error;
    const transactions = normalizeItems(dashboard.data?.transactions); const budgets = normalizeItems(dashboard.data?.budgets); const goals = normalizeItems(dashboard.data?.goals);
    const summary = calculateDashboard(transactions, budgets, goals);
    const items = rowsFrom(insightResult.data, ["items", "insights", "results"]);
    const informational = items.filter((item) => ["spending", "savings"].includes(categoryFor(item))).map((item) => backendCard(item, categoryFor(item)));
    const factual = informational.length ? informational : buildDemoFacts(summary);
    if (insightResult.error) factual.unshift({ category: "spending", title: "Backend insight feed unavailable", body: insightResult.error.message || "The connected insights endpoint could not be loaded. The following summaries are calculated from returned transaction records only.", level: "warning", source: "API status" });
    renderCards($("#insight-facts"), factual, "No spending or savings insight details were returned.");
    const budgetItems = items.filter((item) => categoryFor(item) === "budget");
    $("#insight-budgets").innerHTML = renderBudgetCards(summary, budgetItems).join("");
    const otherItems = items.filter((item) => ["recurring", "anomalies", "cashflow"].includes(categoryFor(item)));
    const signalResult = { recurring, anomalies, cashflow: forecast };
    const signals = ["recurring", "anomalies", "cashflow"].flatMap((category) => signalCards(category, signalResult[category], otherItems));
    $("#insight-signals").innerHTML = signals.map((card) => (typeof card === "string" ? card : insightCard(card))).join("");
    renderChart(trend);
  } catch (error) {
    showPageError(pageError, error.message || "The insight data could not be loaded.", load);
  } finally { main.removeAttribute("aria-busy"); setPageLoading(false); }
}
load();
