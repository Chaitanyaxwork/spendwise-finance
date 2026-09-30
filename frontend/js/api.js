// Flask API origin. Localhost uses the Flask dev server on port 5001 unless config.js overrides it.
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
// Production API address is injected at deploy time into config.js (see build-config.js), so it is
// never committed. When it is empty outside localhost, the app runs in browser-only demo mode.
const runtimeApiUrl = (window.SPENDWISE_CONFIG && window.SPENDWISE_CONFIG.API_BASE_URL) || "";
export const API_BASE_URL = isLocalHost ? (runtimeApiUrl || "http://localhost:5001") : runtimeApiUrl;

const TOKEN_KEY = "spendwise_access_token";
const USER_KEY = "spendwise_user_profile";
export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (token) => token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);
export const setStoredUser = (user) => user ? sessionStorage.setItem(USER_KEY, JSON.stringify(user)) : sessionStorage.removeItem(USER_KEY);
export const clearStoredUser = () => sessionStorage.removeItem(USER_KEY);
export function getStoredUser() {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); }
  catch { return null; }
}

export class ApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

// Flask errors look like { success: false, error: { message, details } }. Field-level validation
// details (or CSV import row errors) are appended so forms show why a request was rejected.
function detailText(details) {
  if (!details || typeof details !== "object") return "";
  if (Array.isArray(details.errors) && details.errors.length) {
    const first = details.errors[0];
    return `Row ${first.row}: ${first.error}`;
  }
  const parts = Object.entries(details)
    .filter(([, value]) => typeof value === "string")
    .map(([field, value]) => (field === "_" ? value : `${field.replace(/_/g, " ")}: ${value}`));
  return parts.join("; ");
}

function payloadMessage(payload, fallback) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== "object") return fallback;
  const error = payload.error;
  if (error && typeof error === "object" && error.message) {
    const extra = detailText(error.details);
    return extra ? `${error.message} (${extra})` : error.message;
  }
  return payload.message || (typeof error === "string" ? error : "") || payload.detail || fallback;
}

// The backend envelope is normalized once here. Page modules receive `data`, never
// a success wrapper, and `{ success: false }` cannot be mistaken for an empty result.
export function normalizeApiResponse(payload, status = 200) {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, "success")) {
    if (payload.success !== true) {
      throw new ApiError(payloadMessage(payload, "The API could not complete this request."), { status, payload });
    }
    return payload.data;
  }
  return payload;
}

async function request(path, { method = "GET", body, auth = true, signal, keepalive = false, withMeta = false } = {}) {
  if (!API_BASE_URL) throw new ApiError("API_BASE_URL is empty; demo mode is active.");
  const headers = { Accept: "application/json" };
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const options = { method, headers, signal, keepalive };
  if (body !== undefined) options.body = body instanceof FormData ? body : JSON.stringify(body);

  let response;
  try {
    response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}${path}`, options);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("Could not reach the API. Check the service URL and connection.");
  }

  const contentType = response.headers.get("content-type") || "";
  let payload = null;
  if (response.status !== 204) {
    try { payload = contentType.includes("application/json") ? await response.json() : await response.text(); }
    catch { payload = null; }
  }
  if (response.status === 401 && auth && token) {
    clearToken();
    clearStoredUser();
    window.dispatchEvent(new CustomEvent("spendwise:unauthorized"));
  }
  if (!response.ok) {
    throw new ApiError(payloadMessage(payload, `Request failed (${response.status}).`), { status: response.status, payload });
  }
  const data = normalizeApiResponse(payload, response.status);
  return withMeta ? { data, meta: payload } : data;
}

const jsonBody = (method, body) => ({ method, body });
const safeMonths = (value) => [3, 6, 12].includes(Number(value)) ? Number(value) : 6;

// ---------------------------------------------------------------------------
// Adapters: translate the Flask API's snake_case responses/requests into the shapes the
// page scripts consume. Page modules stay unchanged.
// ---------------------------------------------------------------------------
const num = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (value) => num(value) === null ? "—" : inr.format(num(value));
const percent = (value) => num(value) === null ? "—" : `${num(value).toFixed(1)}%`;
const capitalize = (text) => String(text || "").replace(/^./, (char) => char.toUpperCase());
const monthLabel = (key) => {
  const match = String(key).match(/^(\d{4})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) : String(key);
};

const toTransaction = (row) => ({ id: row.id, description: row.description || "", category: row.category, type: row.type, amount: num(row.amount), date: row.date });
const toBudget = (row) => ({ id: row.id, category: row.category, limit: num(row.monthly_limit ?? row.limit) });
const budgetBody = (item) => ({ category: item.category, monthly_limit: item.limit ?? item.monthly_limit });
const toGoal = (row) => ({ id: row.id, name: row.name, current: num(row.current_amount ?? row.current), target: num(row.target_amount ?? row.target), targetDate: row.target_date || row.targetDate || "" });
const goalBody = (item) => ({
  name: item.name,
  target_amount: item.target ?? item.target_amount,
  current_amount: item.current ?? item.current_amount ?? 0,
  target_date: item.targetDate || item.target_date || null
});

// The API paginates (max 100 per page); the pages filter and aggregate client-side, so fetch every page.
async function fetchAllTransactions(query = "") {
  const rows = [];
  for (let page = 1; page <= 50; page += 1) {
    const params = new URLSearchParams(query);
    params.set("page", String(page));
    params.set("per_page", "100");
    const { data, meta } = await request(`/api/transactions?${params}`, { withMeta: true });
    rows.push(...(Array.isArray(data) ? data : []).map(toTransaction));
    if (!meta?.pagination?.has_next) break;
  }
  return rows;
}
async function fetchBudgets() { return (await request("/api/budgets") || []).map(toBudget); }
async function fetchGoals() { return (await request("/api/goals") || []).map(toGoal); }

const INSIGHT_KINDS = {
  top_category: ["spending", "Largest spending category"],
  spending_change: ["spending", "Spending change"],
  savings_rate: ["savings", "Savings rate"],
  budget_warning: ["budget", "Budget alert"],
  unusual_expense: ["anomalies", "Unusual expense"],
  recurring: ["recurring", "Recurring expenses"]
};
const INSIGHT_LEVELS = { critical: "danger", warning: "warning", positive: "info", info: "info" };

function healthRows(metrics = {}) {
  const row = (label, value, description) => ({ label, value, description });
  const rate = metrics.savings_rate || {};
  const ratio = metrics.expense_to_income_ratio || {};
  const budget = metrics.budget_utilization || {};
  const recurring = metrics.recurring_expense_ratio || {};
  const consistency = metrics.savings_consistency || {};
  const fund = metrics.emergency_fund || {};
  return [
    row("Savings rate", rate.available ? percent(rate.value) : "—",
      rate.available ? `Common guideline: ${rate.guideline_percent}% or more of income` : "No income recorded in this period"),
    row("Expense-to-income ratio", ratio.available ? percent(ratio.percent) : "—",
      ratio.available ? `${money(ratio.expenses)} spent against ${money(ratio.income)} of income` : "No income recorded in this period"),
    row("Budget utilization", budget.available ? percent(budget.percentage_used) : "—",
      budget.available ? `${budget.status_counts.exceeded} exceeded · ${budget.status_counts.warning} near limit · ${budget.status_counts.ok} on track` : (budget.reason || "No budgets yet")),
    row("Recurring expense ratio", recurring.available ? percent(recurring.value) : "—",
      recurring.available ? `About ${money(recurring.estimated_monthly_recurring)} a month in active recurring expenses` : (recurring.reason || "No income recorded in this period")),
    row("Savings consistency", consistency.available ? percent(consistency.positive_savings_percent) : "—",
      consistency.available ? `${consistency.months_with_positive_savings} of ${consistency.months_analyzed} months ended with positive savings` : (consistency.reason || "More history needed")),
    row("Emergency fund", fund.available ? (fund.months_of_expenses_covered === null ? percent(fund.progress_percentage) : `${fund.months_of_expenses_covered} months`) : "—",
      fund.available ? `${percent(fund.progress_percentage)} of goal · guideline is 3 to 6 months of expenses` : (fund.reason || "No emergency fund goal found"))
  ];
}

export const api = {
  register: (details) => request("/api/auth/register", { ...jsonBody("POST", details), auth: false }),
  login: (credentials) => request("/api/auth/login", { ...jsonBody("POST", credentials), auth: false }),
  logout: () => request("/api/auth/logout", { method: "POST", body: {}, keepalive: true }),
  me: () => request("/api/auth/me"),
  dashboard: async () => {
    const [transactions, budgets, goals] = await Promise.all([fetchAllTransactions(), fetchBudgets(), fetchGoals()]);
    return { transactions, budgets, goals };
  },
  listTransactions: async (query = "") => ({ items: await fetchAllTransactions(query) }),
  createTransaction: async (item) => toTransaction(await request("/api/transactions", jsonBody("POST", item))),
  updateTransaction: async (id, item) => toTransaction(await request(`/api/transactions/${encodeURIComponent(id)}`, jsonBody("PUT", item))),
  deleteTransaction: (id) => request(`/api/transactions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  importCsv: async (file) => {
    const body = new FormData();
    body.append("file", file);
    const result = await request("/api/import/csv", { method: "POST", body });
    const summary = result?.summary || {};
    return { imported: summary.imported ?? 0, duplicatesSkipped: summary.duplicates_skipped ?? 0, invalidRows: summary.invalid_rows ?? 0, ...result };
  },
  listBudgets: async () => ({ items: await fetchBudgets() }),
  createBudget: async (item) => toBudget(await request("/api/budgets", jsonBody("POST", budgetBody(item)))),
  updateBudget: async (id, item) => toBudget(await request(`/api/budgets/${encodeURIComponent(id)}`, jsonBody("PUT", budgetBody(item)))),
  deleteBudget: (id) => request(`/api/budgets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listGoals: async () => ({ items: await fetchGoals() }),
  createGoal: async (item) => toGoal(await request("/api/goals", jsonBody("POST", goalBody(item)))),
  updateGoal: async (id, item) => toGoal(await request(`/api/goals/${encodeURIComponent(id)}`, jsonBody("PUT", goalBody(item)))),
  deleteGoal: (id) => request(`/api/goals/${encodeURIComponent(id)}`, { method: "DELETE" }),
  insights: async () => {
    const data = await request("/api/insights");
    const items = (data?.messages || []).map((message) => {
      const [category, title] = INSIGHT_KINDS[message.type] || ["spending", "Insight"];
      return { category, title, description: message.message, level: INSIGHT_LEVELS[message.severity] || "info" };
    });
    return { items, month: data?.month };
  },
  simulate: (inputs) => request("/api/simulator", jsonBody("POST", inputs)),
  analyticsMonthly: async () => {
    const data = await request("/api/analytics/monthly");
    let months = (data?.chart || []).map((row) => ({
      month: row.month,
      income: row.income,
      expenses: row.expenses,
      netSavings: row.savings,
      savingsRate: row.income > 0 ? Math.round(row.savings / row.income * 1000) / 10 : null
    }));
    // An in-progress month would compare against a full previous month and look misleading.
    if (data?.is_partial && months.length > 1) months = months.slice(0, -1);
    return { months, summaries: data?.summaries, changes: data?.changes };
  },
  analyticsTrends: async (months = 6) => {
    const data = await request(`/api/analytics/trends?months=${safeMonths(months)}`);
    return {
      months: (data?.monthly || []).map((row) => ({ month: row.month, expenses: row.expenses, income: row.income })),
      categoryTrends: (data?.category_trends || []).map((row) => ({ category: row.category, values: row.monthly })),
      averageMonthlySpending: data?.average_monthly_spending,
      increasingCategories: data?.increasing_categories || [],
      decreasingCategories: data?.decreasing_categories || []
    };
  },
  analyticsRecurring: async () => {
    const data = await request("/api/analytics/recurring?status=active");
    return {
      items: (data?.recurring || []).map((row) => ({
        name: row.description,
        category: row.category,
        amount: row.average_amount,
        monthlyCost: row.estimated_monthly_cost,
        frequency: `${capitalize(row.frequency)} · next expected ${row.next_expected_date}`,
        occurrences: row.occurrences
      })),
      summary: data?.summary
    };
  },
  analyticsAnomalies: async () => {
    const data = await request("/api/analytics/anomalies?months=12&limit=20");
    return {
      available: true,
      items: (data?.anomalies || []).map((row) => ({
        title: row.transaction?.description || row.category,
        message: `${row.times_typical}x a typical ${row.category} expense (usually up to ${money(row.expected_range?.high)})`,
        reason: row.reason,
        category: row.category,
        amount: row.amount,
        level: row.severity === "high" ? "danger" : "warning"
      }))
    };
  },
  analyticsForecast: async () => {
    const data = await request("/api/analytics/forecast");
    if (!data?.sufficient_data) {
      return { available: true, months: [{ month: "Forecast unavailable", label: "Forecast unavailable", summary: data?.warnings?.[0] || "More completed months of history are needed.", balance: null }] };
    }
    return {
      available: true,
      months: data.projection.map((row) => ({
        month: row.month,
        label: `${monthLabel(row.month)} · cumulative net`,
        balance: row.cumulative_cash_flow,
        cashFlow: row.cumulative_cash_flow,
        summary: `Income ${money(row.income)} · Expenses ${money(row.expenses)} · Net ${money(row.savings)}`
      })),
      horizons: data.horizons
    };
  },
  analyticsHealth: async () => {
    const data = await request("/api/analytics/health");
    return { available: true, metrics: healthRows(data?.metrics), notes: data?.notes || [] };
  },
  analyticsReport: async () => {
    const data = await request("/api/analytics/report");
    return { title: `SpendWise report · ${data?.month ?? ""}`.trim(), generatedAt: data?.generated_on, currency: "INR", ...data };
  }
};

export function normalizeItems(payload, key = "items") {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload[key])) return payload[key];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}
