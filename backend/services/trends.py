import numpy as np
import pandas as pd

from services.timeseries import completed_months, monthly_table, pct_change, r2

MIN_TREND_MONTHS = 4
CHANGE_THRESHOLD = 10.0
MATERIALITY = 0.01
MAX_CATEGORIES = 15


def classify(series, reference_average):
    n = len(series)
    if n < MIN_TREND_MONTHS:
        return {"direction": None, "change_percent": None, "earlier_average": None, "recent_average": None}
    half = n // 2
    earlier, recent = float(series.iloc[:half].mean()), float(series.iloc[-half:].mean())
    diff = recent - earlier
    pct = pct_change(recent, earlier)
    material = abs(diff) > 0.005 and abs(diff) >= MATERIALITY * reference_average
    if material and (pct is None or abs(pct) >= CHANGE_THRESHOLD):
        direction = "increasing" if diff > 0 else "decreasing"
    else:
        direction = "stable"
    return {
        "direction": direction,
        "change_percent": pct,
        "earlier_average": r2(earlier),
        "recent_average": r2(recent),
    }


def build_trends(df, months=6, today=None):
    table = completed_months(monthly_table(df), today).tail(months)
    n = len(table)
    base = {
        "period": {
            "months_requested": months,
            "months_analyzed": n,
            "start": table.index[0] if n else None,
            "end": table.index[-1] if n else None,
            "excludes_current_month": True,
        },
        "sufficient_data": n >= MIN_TREND_MONTHS,
        "monthly": [],
        "average_monthly_spending": 0.0,
        "highest_spending_month": None,
        "lowest_spending_month": None,
        "spending_trend": None,
        "category_trends": [],
        "increasing_categories": [],
        "decreasing_categories": [],
    }
    if n == 0:
        return base

    expenses = table["expenses"]
    average = float(expenses.mean())
    base["monthly"] = [
        {"month": m, "expenses": r2(row["expenses"]), "income": r2(row["income"])}
        for m, row in table.iterrows()
    ]
    base["average_monthly_spending"] = r2(average)
    base["highest_spending_month"] = {"month": str(expenses.idxmax()), "amount": r2(expenses.max())}
    base["lowest_spending_month"] = {"month": str(expenses.idxmin()), "amount": r2(expenses.min())}

    overall = classify(expenses, average)
    slope = float(np.polyfit(np.arange(n), expenses.to_numpy(dtype=float), 1)[0]) if n >= 2 else 0.0
    base["spending_trend"] = {
        **overall,
        "slope_per_month": r2(slope),
        "slope_percent_of_average": r2(slope / average * 100) if average > 0 else None,
    }

    spent = df[(df["type"] == "expense") & (df["month"].isin(table.index))]
    if spent.empty:
        return base
    by_category = (
        spent.pivot_table(index="month", columns="category", values="amount", aggfunc="sum", fill_value=0.0)
        .reindex(table.index, fill_value=0.0)
    )
    total_spent = float(by_category.to_numpy().sum())
    trends = []
    for category in by_category.columns:
        series = by_category[category]
        total = float(series.sum())
        trends.append({
            "category": str(category),
            "total": r2(total),
            "average_monthly": r2(series.mean()),
            "share_percent": r2(total / total_spent * 100) if total_spent else 0.0,
            **classify(series, average),
            "monthly": [{"month": m, "amount": r2(v)} for m, v in series.items()],
        })
    trends.sort(key=lambda t: t["total"], reverse=True)
    base["category_trends"] = trends[:MAX_CATEGORIES]
    for direction, key in (("increasing", "increasing_categories"), ("decreasing", "decreasing_categories")):
        picked = [t for t in trends if t["direction"] == direction]
        picked.sort(key=lambda t: abs(t["recent_average"] - t["earlier_average"]), reverse=True)
        base[key] = [
            {
                "category": t["category"],
                "change_percent": t["change_percent"],
                "earlier_average": t["earlier_average"],
                "recent_average": t["recent_average"],
            }
            for t in picked
        ]
    return base
