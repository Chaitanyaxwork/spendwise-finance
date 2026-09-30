const monthId = (year, monthIndex) => `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

export const toAmount = (value) => {
  if (value === null || value === undefined || typeof value === "boolean" || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const sumAmounts = (values) => {
  let total = 0;
  for (const value of values) {
    const amount = toAmount(value);
    if (amount === null) return null;
    total += amount;
  }
  return total;
};

const subtract = (left, right) => left === null || right === null ? null : left - right;

export function isValidDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
const parseDate = (value) => isValidDate(value) ? new Date(`${value}T12:00:00`) : null;
const monthKey = (value) => { const date = parseDate(value); return date ? monthId(date.getFullYear(), date.getMonth()) : ""; };
const sumType = (rows, type) => sumAmounts(rows.filter((item) => item.type === type).map((item) => item.amount));

export function buildMonthlySeries(transactions, count = 6, now = new Date()) {
  const rows = Array.isArray(transactions) ? transactions : [];
  const size = Math.min(36, Math.max(1, Math.floor(Number(count) || 6)));
  return Array.from({ length: size }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (size - index - 1), 1);
    const key = monthId(date.getFullYear(), date.getMonth());
    const entries = rows.filter((item) => monthKey(item.date) === key);
    const income = sumType(entries, "income");
    const expenses = sumType(entries, "expense");
    return { key, month: key, label: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), income, expenses, netSavings: subtract(income, expenses), transactions: entries.length };
  });
}

const percentChange = (current, previous) => current === null || previous === null || previous === 0 ? null : (current - previous) / Math.abs(previous) * 100;

export function calculateDashboard(transactions, budgets, goals, now = new Date()) {
  const rows = Array.isArray(transactions) ? transactions : [];
  const currentMonth = monthId(now.getFullYear(), now.getMonth());
  const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = monthId(previousDate.getFullYear(), previousDate.getMonth());
  const current = rows.filter((item) => monthKey(item.date) === currentMonth);
  const previous = rows.filter((item) => monthKey(item.date) === previousMonth);
  const income = sumType(current, "income");
  const expenses = sumType(current, "expense");
  const previousIncome = sumType(previous, "income");
  const previousExpenses = sumType(previous, "expense");
  const savings = subtract(income, expenses);
  const previousSavings = subtract(previousIncome, previousExpenses);
  const savingsRate = income !== null && expenses !== null && income > 0 && savings !== null ? savings / income * 100 : null;
  const previousSavingsRate = previousIncome !== null && previousExpenses !== null && previousIncome > 0 && previousSavings !== null ? previousSavings / previousIncome * 100 : null;
  const categoryTotals = {};
  current.filter((item) => item.type === "expense").forEach((item) => {
    const category = String(item.category || "Other");
    const amount = toAmount(item.amount);
    if (!Object.prototype.hasOwnProperty.call(categoryTotals, category)) categoryTotals[category] = amount;
    else categoryTotals[category] = categoryTotals[category] === null || amount === null ? null : categoryTotals[category] + amount;
  });
  const sortedTransactions = [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const budgetStatus = calculateBudgets(budgets, rows, currentMonth);
  const goalStatus = (Array.isArray(goals) ? goals : []).map((goal) => {
    const currentAmount = toAmount(goal.current); const target = toAmount(goal.target);
    const available = currentAmount !== null && target !== null && target > 0;
    const progress = available ? Math.min(100, Math.max(0, currentAmount / target * 100)) : null;
    return { ...goal, current: currentAmount, target, remaining: available ? Math.max(0, target - currentAmount) : null, progress, status: available ? "available" : "unavailable" };
  });
  return {
    currentMonth, previousMonth, income, expenses, savings, savingsRate,
    previousIncome, previousExpenses, previousSavings, previousSavingsRate,
    incomeChange: percentChange(income, previousIncome),
    expenseChange: percentChange(expenses, previousExpenses),
    savingsChange: percentChange(savings, previousSavings),
    savingsRateChange: percentChange(savingsRate, previousSavingsRate),
    categoryTotals,
    monthSeries: buildMonthlySeries(rows, 6, now),
    trendSeries: buildMonthlySeries(rows, 12, now),
    currentTransactions: current,
    recentTransactions: sortedTransactions.slice(0, 6),
    budgetStatus, goalStatus
  };
}

export function calculateBudgets(budgets, transactions, month = monthId(new Date().getFullYear(), new Date().getMonth())) {
  const rows = Array.isArray(transactions) ? transactions : [];
  return (Array.isArray(budgets) ? budgets : []).map((budget) => {
    const category = String(budget.category || "");
    const matching = rows.filter((item) => item.type === "expense" && String(item.category || "").toLowerCase() === category.toLowerCase() && monthKey(item.date) === month);
    const used = sumAmounts(matching.map((item) => item.amount));
    const limit = toAmount(budget.limit);
    const available = used !== null && limit !== null && limit > 0;
    const progress = available ? used / limit * 100 : null;
    const remaining = available ? limit - used : null;
    const status = !available ? "unavailable" : progress >= 100 ? "danger" : progress >= 80 ? "warning" : "normal";
    return { ...budget, used, limit, remaining, progress, status };
  });
}

export function deriveInsights(transactions, budgetStatus = []) {
  const rows = Array.isArray(transactions) ? transactions.filter((item) => item.type === "expense") : [];
  const byCategory = rows.reduce((acc, item) => {
    const category = String(item.category || "Other"); const amount = toAmount(item.amount);
    if (!Object.prototype.hasOwnProperty.call(acc, category)) acc[category] = amount;
    else acc[category] = acc[category] === null || amount === null ? null : acc[category] + amount;
    return acc;
  }, {});
  const categoryValuesComplete = Object.values(byCategory).every((amount) => amount !== null);
  const highest = categoryValuesComplete ? Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0] || null : null;
  const monthNames = [...new Set(rows.map((item) => monthKey(item.date)).filter(Boolean))].sort();
  const totalsByMonth = monthNames.map((month) => ({ month, total: sumAmounts(rows.filter((item) => monthKey(item.date) === month).map((item) => item.amount)) }));
  const repeats = rows.reduce((acc, item) => {
    const key = String(item.description || "").trim().toLowerCase();
    if (!key) return acc;
    const amount = toAmount(item.amount);
    if (!acc[key]) acc[key] = { name: String(item.description), category: String(item.category || "Other"), count: 1, total: amount, months: new Set() };
    else { acc[key].count += 1; acc[key].total = acc[key].total === null || amount === null ? null : acc[key].total + amount; }
    const month = monthKey(item.date); if (month) acc[key].months.add(month);
    return acc;
  }, {});
  const recurringCandidates = Object.values(repeats)
    .filter((item) => item.count >= 3 && item.months.size >= 2)
    .map(({ months, ...item }) => ({ ...item, monthsObserved: months.size }))
    .sort((a, b) => b.monthsObserved - a.monthsObserved || b.count - a.count);
  return {
    highest,
    totalsByMonth,
    recurringCandidates,
    // Anomalies require a supplied analytics signal; do not guess a threshold here.
    budgetWarnings: (Array.isArray(budgetStatus) ? budgetStatus : []).filter((item) => item.status === "warning" || item.status === "danger").sort((a, b) => b.progress - a.progress)
  };
}

export function calculateSavingsScenario({ currentSavings, monthlyContribution, targetAmount, months, annualReturnRate = 0 } = {}) {
  const current = toAmount(currentSavings);
  const contribution = toAmount(monthlyContribution);
  const target = toAmount(targetAmount);
  const term = toAmount(months);
  const annualRate = toAmount(annualReturnRate);
  if ([current, contribution, target, term, annualRate].some((value) => value === null) || [current, contribution, target, annualRate].some((value) => value < 0) || term < 1 || term > 600) return { error: "Enter current savings, a monthly contribution, a target, and a time period between 1 and 600 months. Amounts and return rate must be non-negative." };
  const termMonths = Math.floor(term);
  if (termMonths < 1) return { error: "Enter a time period between 1 and 600 months." };
  const monthlyRate = annualRate / 100 / 12;
  let balance = current;
  const rows = [];
  for (let month = 1; month <= termMonths; month += 1) {
    balance *= 1 + monthlyRate;
    balance += contribution;
    rows.push({ month, contribution, total: balance });
  }
  const factor = (1 + monthlyRate) ** termMonths;
  const targetBeforeContributions = current * factor;
  let requiredMonthlyContribution = 0;
  if (target > targetBeforeContributions) {
    requiredMonthlyContribution = monthlyRate === 0
      ? (target - current) / termMonths
      : (target - targetBeforeContributions) * monthlyRate / (factor - 1);
  }
  return {
    currentSavings: current,
    monthlyContribution: contribution,
    targetAmount: target,
    months: termMonths,
    annualReturnRate: annualRate,
    projectedSavings: balance,
    progressPercent: target > 0 ? Math.min(100, balance / target * 100) : 0,
    requiredMonthlyContribution,
    rows
  };
}

// Preserve the original Phase 1 calculator export for integrations that still call it.
export function calculateProjection({ income = 0, expenses = 0, savings, years = 1 } = {}) {
  const incomeAmount = toAmount(income);
  const expenseAmount = toAmount(expenses);
  const explicitSavings = savings === undefined && incomeAmount !== null && expenseAmount !== null ? Math.max(0, incomeAmount - expenseAmount) : toAmount(savings);
  const yearCount = toAmount(years);
  if (incomeAmount === null || expenseAmount === null || explicitSavings === null || yearCount === null) return { error: "Income, expenses, savings and years must be supplied as valid numbers." };
  return calculateSavingsScenario({ currentSavings: 0, monthlyContribution: explicitSavings, targetAmount: 0, months: Math.max(1, Math.floor(yearCount * 12)), annualReturnRate: 0 });
}

export const currentMonthKey = (date = new Date()) => monthId(date.getFullYear(), date.getMonth());
export { monthKey };
