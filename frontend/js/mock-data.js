import { buildMonthlySeries, currentMonthKey, deriveInsights, sumAmounts } from "./calculations.js";

const STORAGE_KEY = "spendwise_demo_state_v1";
const monthOffset = (offset, day = 5) => {
  const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const id = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function seed() {
  const tx = [
    ["Salary", "Income", "income", 120000, 1, 0], ["Rent", "Housing", "expense", 32000, 2, 0], ["Groceries", "Food", "expense", 8400, 4, 0], ["Metro pass", "Transport", "expense", 2800, 5, 0], ["Electricity & water", "Utilities", "expense", 4600, 7, 0], ["Cafe Linden", "Dining", "expense", 450, 8, 0], ["Pharmacy", "Healthcare", "expense", 1200, 10, 0], ["Groceries", "Food", "expense", 5200, 12, 0], ["Dinner with friends", "Dining", "expense", 1900, 14, 0], ["Streaming subscription", "Entertainment", "expense", 499, 16, 0], ["Household supplies", "Shopping", "expense", 2350, 18, 0], ["Cafe Linden", "Dining", "expense", 680, 19, 0], ["Internet", "Utilities", "expense", 999, 20, 0],
    ["Salary", "Income", "income", 120000, 1, -1], ["Rent", "Housing", "expense", 32000, 2, -1], ["Groceries", "Food", "expense", 10200, 4, -1], ["Metro pass", "Transport", "expense", 2800, 5, -1], ["Electricity & water", "Utilities", "expense", 4900, 7, -1], ["Cafe Linden", "Dining", "expense", 620, 9, -1], ["Pharmacy", "Healthcare", "expense", 1800, 10, -1], ["Groceries", "Food", "expense", 6100, 12, -1], ["Dinner with friends", "Dining", "expense", 1550, 14, -1], ["Streaming subscription", "Entertainment", "expense", 499, 16, -1], ["Home goods", "Shopping", "expense", 4400, 18, -1], ["Cafe Linden", "Dining", "expense", 520, 21, -1],
    ["Salary", "Income", "income", 120000, 1, -2], ["Rent", "Housing", "expense", 32000, 2, -2], ["Groceries", "Food", "expense", 9500, 5, -2], ["Metro pass", "Transport", "expense", 2800, 5, -2], ["Electricity & water", "Utilities", "expense", 4400, 8, -2], ["Cafe Linden", "Dining", "expense", 575, 9, -2], ["Dinner with friends", "Dining", "expense", 2200, 15, -2], ["Streaming subscription", "Entertainment", "expense", 499, 17, -2],
    ["Salary", "Income", "income", 120000, 1, -3], ["Rent", "Housing", "expense", 32000, 2, -3], ["Groceries", "Food", "expense", 9800, 5, -3], ["Metro pass", "Transport", "expense", 2800, 5, -3], ["Electricity & water", "Utilities", "expense", 4200, 7, -3], ["Cafe Linden", "Dining", "expense", 480, 11, -3], ["Dinner with friends", "Dining", "expense", 2050, 17, -3], ["Streaming subscription", "Entertainment", "expense", 499, 18, -3],
    ["Salary", "Income", "income", 120000, 1, -4], ["Rent", "Housing", "expense", 32000, 2, -4], ["Groceries", "Food", "expense", 9100, 4, -4], ["Metro pass", "Transport", "expense", 2800, 5, -4], ["Electricity & water", "Utilities", "expense", 4600, 7, -4], ["Cafe Linden", "Dining", "expense", 425, 9, -4], ["Dinner with friends", "Dining", "expense", 1800, 15, -4], ["Streaming subscription", "Entertainment", "expense", 499, 18, -4],
    ["Salary", "Income", "income", 120000, 1, -5], ["Rent", "Housing", "expense", 32000, 2, -5], ["Groceries", "Food", "expense", 9700, 5, -5], ["Metro pass", "Transport", "expense", 2800, 5, -5], ["Electricity & water", "Utilities", "expense", 4100, 8, -5], ["Cafe Linden", "Dining", "expense", 550, 9, -5], ["Dinner with friends", "Dining", "expense", 1950, 15, -5], ["Streaming subscription", "Entertainment", "expense", 499, 18, -5]
  ].map(([description, category, type, amount, day, offset]) => ({ id: id(), description, category, type, amount, date: monthOffset(offset, day) }));
  return {
    transactions: tx,
    budgets: [
      { id: id(), category: "Housing", limit: 35000 }, { id: id(), category: "Food", limit: 18000 }, { id: id(), category: "Dining", limit: 10000 }, { id: id(), category: "Transport", limit: 8000 }, { id: id(), category: "Utilities", limit: 7000 }, { id: id(), category: "Healthcare", limit: 5000 }, { id: id(), category: "Shopping", limit: 8000 }, { id: id(), category: "Entertainment", limit: 2500 }
    ],
    goals: [
      { id: id(), name: "Emergency fund", current: 125000, target: 500000, targetDate: monthOffset(16, 1) },
      { id: id(), name: "A week away", current: 42000, target: 150000, targetDate: monthOffset(8, 1) }
    ]
  };
}

function readState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (value && Array.isArray(value.transactions) && Array.isArray(value.budgets) && Array.isArray(value.goals)) return value;
  } catch { /* Restore the labelled INR demo seed if the browser value is missing or invalid. */ }
  const value = seed(); saveState(value); return value;
}
function saveState(value) { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); }
function mutate(callback) { const state = readState(); const result = callback(state); saveState(state); return result; }
const copy = (value) => structuredClone(value);
const today = () => new Date().toISOString().slice(0, 10);
const readDemoUser = () => { try { return JSON.parse(sessionStorage.getItem("spendwise_demo_user") || "null"); } catch { return null; } };
function recurringObservations(transactions) {
  return deriveInsights(transactions).recurringCandidates.map((item) => ({
    name: item.name,
    category: item.category,
    occurrences: item.count,
    monthsObserved: item.monthsObserved,
    totalRecorded: item.total,
    classification: "Repeated description in sample records; not a verified subscription."
  }));
}

export const demoApi = {
  mode: "demo",
  async login({ email, password }) {
    if (!email || !password) throw new Error("Enter your email and password.");
    const user = { name: email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), email };
    sessionStorage.setItem("spendwise_demo_user", JSON.stringify(user));
    return { user, access_token: `demo.${btoa(unescape(encodeURIComponent(email)))}.${Date.now()}` };
  },
  async register({ name, email, password }) {
    if (!name || !email || !password) throw new Error("Complete every required field.");
    const user = { name, email };
    sessionStorage.setItem("spendwise_demo_user", JSON.stringify(user));
    return { user, access_token: `demo.${btoa(unescape(encodeURIComponent(email)))}.${Date.now()}` };
  },
  async me() { return { user: readDemoUser() || { name: "Demo account", email: "demo@example.test", accountType: "Browser-only demo" } }; },
  async dashboard() { const state = readState(); return { ...copy(state), period: currentMonthKey() }; },
  async listTransactions() { return { items: copy(readState().transactions) }; },
  async createTransaction(item) { return mutate((state) => { const value = { ...item, id: id() }; state.transactions.unshift(value); return copy(value); }); },
  async updateTransaction(transactionId, item) { return mutate((state) => { const index = state.transactions.findIndex((row) => row.id === transactionId); if (index < 0) throw new Error("That transaction is no longer available."); state.transactions[index] = { ...state.transactions[index], ...item, id: transactionId }; return copy(state.transactions[index]); }); },
  async deleteTransaction(transactionId) { return mutate((state) => { const index = state.transactions.findIndex((row) => row.id === transactionId); if (index < 0) throw new Error("That transaction is no longer available."); state.transactions.splice(index, 1); return { success: true }; }); },
  async importCsv(rows) { return mutate((state) => { const accepted = rows.map((row) => ({ ...row, id: id() })); state.transactions.unshift(...accepted); return { imported: accepted.length }; }); },
  async listBudgets() { return { items: copy(readState().budgets) }; },
  async createBudget(item) { return mutate((state) => { const existing = state.budgets.find((row) => row.category.toLowerCase() === item.category.toLowerCase()); if (existing) throw new Error("A budget for this category already exists. Edit its limit instead."); const value = { ...item, id: id() }; state.budgets.push(value); return copy(value); }); },
  async updateBudget(budgetId, item) { return mutate((state) => { const index = state.budgets.findIndex((row) => row.id === budgetId); if (index < 0) throw new Error("That budget is no longer available."); state.budgets[index] = { ...state.budgets[index], ...item }; return copy(state.budgets[index]); }); },
  async deleteBudget(budgetId) { return mutate((state) => { state.budgets = state.budgets.filter((row) => row.id !== budgetId); return { success: true }; }); },
  async listGoals() { return { items: copy(readState().goals) }; },
  async createGoal(item) { return mutate((state) => { const value = { ...item, id: id() }; state.goals.unshift(value); return copy(value); }); },
  async updateGoal(goalId, item) { return mutate((state) => { const index = state.goals.findIndex((row) => row.id === goalId); if (index < 0) throw new Error("That goal is no longer available."); state.goals[index] = { ...state.goals[index], ...item }; return copy(state.goals[index]); }); },
  async deleteGoal(goalId) { return mutate((state) => { state.goals = state.goals.filter((row) => row.id !== goalId); return { success: true }; }); },
  async insights() { const state = readState(); return { transactions: copy(state.transactions), budgets: copy(state.budgets) }; },
  async analyticsMonthly() { return { months: buildMonthlySeries(readState().transactions, 12) }; },
  async analyticsTrends(input = 6) {
    const months = typeof input === "number" ? input : Number(input?.months || 6);
    const state = readState(); const series = buildMonthlySeries(state.transactions, months);
    const categories = [...new Set(state.transactions.filter((row) => row.type === "expense").map((row) => row.category))];
    const categoryTrends = categories.map((category) => ({ category, values: series.map((month) => ({ month: month.key, amount: sumAmounts(state.transactions.filter((row) => row.type === "expense" && row.category === category && String(row.date).startsWith(month.key)).map((row) => row.amount)) })) }));
    return { months: series, categoryTrends };
  },
  async analyticsRecurring() { return { items: recurringObservations(readState().transactions), source: "demo" }; },
  async analyticsAnomalies() { return { available: false, items: [], source: "demo" }; },
  async analyticsForecast() { return { available: false, months: [], source: "demo" }; },
  async analyticsHealth() { return { available: false, metrics: [], source: "demo" }; },
  async analyticsReport() {
    const state = readState();
    return { title: "SpendWise demo report", generatedAt: new Date().toISOString(), currency: "INR", source: "Sample browser-local demo data", months: buildMonthlySeries(state.transactions, 12), recurringObservations: recurringObservations(state.transactions) };
  },
  async simulate(inputs) { return copy(inputs); },
  getDemoUser: readDemoUser,
  clearDemoUser() { sessionStorage.removeItem("spendwise_demo_user"); },
  today
};
