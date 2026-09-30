import numpy as np

from services.timeseries import completed_months, monthly_table, r2, shift_month, today_or, month_of

HORIZONS = (3, 6, 12)
MAX_HISTORY = 12
MIN_HISTORY = 3
TREND_MIN_MONTHS = 6
TREND_MIN_R2 = 0.5
TREND_CAP = 0.5


def fit_series(values, steps):
    y = np.asarray(values, dtype=float)
    n = len(y)
    mean = float(y.mean())
    std = float(y.std(ddof=1)) if n > 1 else 0.0
    info = {"method": "moving_average", "slope_per_month": 0.0, "r_squared": None}
    predictions = [mean] * steps

    if n >= TREND_MIN_MONTHS:
        x = np.arange(n)
        slope, intercept = (float(v) for v in np.polyfit(x, y, 1))
        fitted = intercept + slope * x
        ss_res = float(((y - fitted) ** 2).sum())
        ss_tot = float(((y - mean) ** 2).sum())
        fit_quality = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
        info["r_squared"] = round(fit_quality, 3)
        if fit_quality >= TREND_MIN_R2:
            info.update(method="linear_trend", slope_per_month=r2(slope))
            std = float(np.sqrt(ss_res / (n - 2)))
            floor, ceiling = mean * (1 - TREND_CAP), mean * (1 + TREND_CAP)
            predictions = [min(max(intercept + slope * (n - 1 + h), floor), ceiling) for h in range(1, steps + 1)]

    predictions = [max(p, 0.0) for p in predictions]
    return predictions, std, info


def build_forecast(df, today=None):
    today = today_or(today)
    table = completed_months(monthly_table(df), today).tail(MAX_HISTORY)
    n = len(table)
    available = [h for h in HORIZONS if n >= h]
    max_h = max(available, default=0)

    result = {
        "sufficient_data": max_h > 0,
        "history": {
            "months_used": n,
            "start": table.index[0] if n else None,
            "end": table.index[-1] if n else None,
            "excludes_current_month": True,
        },
        "methods": None,
        "assumptions": [
            "Uses only completed months (the current month is excluded).",
            "Fewer than 6 months of history: projection is the average of those months.",
            "6+ months: a linear trend is used only if it fits the history well (R-squared >= 0.5), "
            "and is capped at +/-50% of the historical average; otherwise the average is used.",
            "The range is +/-1 standard deviation of historical (or residual) monthly values.",
            "Savings = income - expenses (net monthly cash flow); cumulative cash flow is the running total.",
        ],
        "warnings": [],
        "projection": [],
        "horizons": {},
    }
    for h in HORIZONS:
        result["horizons"][str(h)] = (
            {"months": h, "available": False, "required_months": h, "history_months": n}
            if h > n else {"months": h, "available": True}
        )
    if not max_h:
        result["warnings"].append(f"At least {MIN_HISTORY} completed months of data are needed to forecast.")
        return result

    last = table.index[-1]
    if last < shift_month(month_of(today), -1):
        result["warnings"].append(
            f"Your most recent completed data is from {last}; projections assume that pattern continues."
        )

    income, income_std, income_info = fit_series(table["income"], max_h)
    expenses, expenses_std, expenses_info = fit_series(table["expenses"], max_h)
    result["methods"] = {"income": income_info, "expenses": expenses_info}

    rows, cumulative = [], 0.0
    for i in range(max_h):
        savings = income[i] - expenses[i]
        cumulative += savings
        rows.append({
            "month": shift_month(last, i + 1),
            "income": r2(income[i]),
            "expenses": r2(expenses[i]),
            "savings": r2(savings),
            "cumulative_cash_flow": r2(cumulative),
            "income_range": {"low": r2(max(income[i] - income_std, 0)), "high": r2(income[i] + income_std)},
            "expenses_range": {"low": r2(max(expenses[i] - expenses_std, 0)), "high": r2(expenses[i] + expenses_std)},
        })
    result["projection"] = rows

    for h in available:
        window = rows[:h]
        total_income = sum(r["income"] for r in window)
        total_expenses = sum(r["expenses"] for r in window)
        result["horizons"][str(h)].update({
            "end_month": window[-1]["month"],
            "total_income": r2(total_income),
            "total_expenses": r2(total_expenses),
            "total_savings": r2(total_income - total_expenses),
            "avg_monthly_savings": r2((total_income - total_expenses) / h),
            "ending_cumulative_cash_flow": window[-1]["cumulative_cash_flow"],
        })
    return result
