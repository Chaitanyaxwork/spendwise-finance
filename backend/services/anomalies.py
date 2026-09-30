import numpy as np

from services.timeseries import month_of, shift_month, today_or

MIN_CATEGORY_SAMPLES = 6
MIN_OVERALL_SAMPLES = 10
MIN_TIMES_MEDIAN = 1.5
METHOD = (
    "Tukey fences: an expense is flagged when it is above Q3 + 1.5 x IQR of your own history for the "
    "same category (or all expenses when a category has too little history) and at least 1.5x the median."
)


def _fences(values):
    q1, med, q3 = (float(v) for v in np.percentile(values, [25, 50, 75]))
    iqr = q3 - q1
    return {
        "median": med,
        "low": max(q1 - 1.5 * iqr, 0.0),
        "high": q3 + 1.5 * iqr,
        "extreme": q3 + 3 * iqr,
        "n": int(len(values)),
    }


def detect_anomalies(df, months=12, month=None, limit=20, today=None):
    expenses = df[df["type"] == "expense"]
    result = {"anomalies": [], "total_flagged": 0, "expenses_analyzed": 0, "sufficient_data": False}
    if expenses.empty:
        return result

    overall = _fences(expenses["amount"].to_numpy(dtype=float)) if len(expenses) >= MIN_OVERALL_SAMPLES else None
    by_category = {
        name: _fences(group["amount"].to_numpy(dtype=float))
        for name, group in expenses.groupby("category")
        if len(group) >= MIN_CATEGORY_SAMPLES
    }
    result["sufficient_data"] = bool(overall or by_category)

    if month:
        candidates = expenses[expenses["month"] == month]
    elif months:
        start = shift_month(month_of(today_or(today)), -(months - 1))
        candidates = expenses[expenses["month"] >= start]
    else:
        candidates = expenses
    result["expenses_analyzed"] = int(len(candidates))

    found = []
    for row in candidates.itertuples():
        if row.category in by_category:
            scope, fence = "category", by_category[row.category]
        elif overall:
            scope, fence = "all_expenses", overall
        else:
            continue
        amount = float(row.amount)
        if amount <= fence["high"] or fence["median"] <= 0 or amount < MIN_TIMES_MEDIAN * fence["median"]:
            continue
        times = amount / fence["median"]
        label = row.category if scope == "category" else "all"
        found.append({
            "transaction": {
                "id": int(row.id),
                "date": row.date.strftime("%Y-%m-%d"),
                "description": row.description,
                "category": row.category,
                "amount": round(amount, 2),
            },
            "category": row.category,
            "amount": round(amount, 2),
            "expected_range": {
                "low": round(fence["low"], 2),
                "high": round(fence["high"], 2),
                "typical": round(fence["median"], 2),
            },
            "times_typical": round(times, 1),
            "severity": "high" if amount > fence["extreme"] else "moderate",
            "baseline": {"scope": scope, "sample_size": fence["n"]},
            "reason": (
                f"{amount:,.2f} is {times:.1f}x your typical {label} expense ({fence['median']:,.2f}) and above "
                f"the top of your normal range ({fence['high']:,.2f}), based on {fence['n']} past "
                f"{'transactions in this category' if scope == 'category' else 'expenses'}."
            ),
        })
    found.sort(key=lambda a: (a["severity"] != "high", -a["amount"]))
    result["total_flagged"] = len(found)
    result["anomalies"] = found[:limit]
    return result
