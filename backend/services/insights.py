import pandas as pd

from services.analytics import category_spending, load_frame, totals
from services.anomalies import detect_anomalies
from services.budgets import budgets_with_status
from services.recurring import detect_recurring
from utils.validators import current_month, previous_month


def resolve_month(df, month):
    if month:
        return month
    current = current_month()
    if df.empty or (df["month"] == current).any():
        return current
    return str(df["month"].max())


def _fmt(value):
    return f"{value:,.2f}"


def highest_category(df, month):
    spending = category_spending(df[df["month"] == month])
    return spending[0] if spending else None


def spending_change(df, month):
    prev_month = previous_month(month)
    expenses = df[df["type"] == "expense"]
    current = expenses[expenses["month"] == month].groupby("category")["amount"].sum()
    previous = expenses[expenses["month"] == prev_month].groupby("category")["amount"].sum()
    cur_total, prev_total = float(current.sum()), float(previous.sum())
    change = cur_total - prev_total

    combined = pd.concat([current.rename("current"), previous.rename("previous")], axis=1).fillna(0.0)
    combined["change"] = combined["current"] - combined["previous"]
    combined = combined.sort_values("change", key=lambda s: s.abs(), ascending=False).head(3)
    categories = [
        {
            "category": name,
            "current": round(float(r["current"]), 2),
            "previous": round(float(r["previous"]), 2),
            "change": round(float(r["change"]), 2),
            "change_percent": round(float(r["change"]) / float(r["previous"]) * 100, 2) if r["previous"] > 0 else None,
        }
        for name, r in combined.iterrows()
        if abs(r["change"]) > 0.005
    ]
    return {
        "month": month,
        "previous_month": prev_month,
        "current_spending": round(cur_total, 2),
        "previous_spending": round(prev_total, 2),
        "change_amount": round(change, 2),
        "change_percent": round(change / prev_total * 100, 2) if prev_total > 0 else None,
        "direction": "increase" if change > 0.005 else "decrease" if change < -0.005 else "flat",
        "has_previous_data": bool((df["month"] == prev_month).any()),
        "category_changes": categories,
    }


def savings_rate(df, month):
    t = totals(df[df["month"] == month])
    rate = t["savings_percentage"] if t["total_income"] > 0 else None
    if rate is None:
        assessment = "no_income"
    elif rate >= 20:
        assessment = "healthy"
    elif rate >= 10:
        assessment = "fair"
    elif rate >= 0:
        assessment = "low"
    else:
        assessment = "negative"
    return {
        "month": month,
        "income": t["total_income"],
        "expenses": t["total_expenses"],
        "savings": t["total_savings"],
        "savings_rate": rate,
        "assessment": assessment,
    }


def budget_warnings(user_id, month):
    items = [b for b in budgets_with_status(user_id, month) if b["status"] != "ok"]
    items.sort(key=lambda b: b["percentage_used"], reverse=True)
    return [
        {
            "category": b["category"],
            "monthly_limit": b["monthly_limit"],
            "spent": b["spent"],
            "percentage_used": b["percentage_used"],
            "status": b["status"],
        }
        for b in items
    ]


def unusual_expenses(df, month=None, limit=10):
    result = detect_anomalies(df, months=None, month=month, limit=limit)
    return [
        {
            "id": a["transaction"]["id"],
            "date": a["transaction"]["date"],
            "description": a["transaction"]["description"],
            "category": a["category"],
            "amount": a["amount"],
            "typical_amount": a["expected_range"]["typical"],
            "times_typical": a["times_typical"],
        }
        for a in result["anomalies"]
    ]


def recurring_expenses(df):
    return detect_recurring(df)


def _messages(month, top, change, rate, warnings, unusual, recurring):
    msgs = []
    if top:
        msgs.append({
            "type": "top_category", "severity": "info",
            "message": f"Your highest spending category in {month} is {top['category']} "
                       f"({_fmt(top['amount'])}, {top['percentage']}% of spending).",
        })
    if change["has_previous_data"] and change["direction"] != "flat":
        pct = f" ({abs(change['change_percent'])}%)" if change["change_percent"] is not None else ""
        msgs.append({
            "type": "spending_change",
            "severity": "warning" if change["direction"] == "increase" else "positive",
            "message": f"Spending {'increased' if change['direction'] == 'increase' else 'decreased'} "
                       f"by {_fmt(abs(change['change_amount']))}{pct} compared to {change['previous_month']}.",
        })
    if rate["savings_rate"] is not None:
        severity = "positive" if rate["assessment"] in ("healthy", "fair") else "warning"
        msgs.append({
            "type": "savings_rate", "severity": severity,
            "message": f"Your savings rate in {month} is {rate['savings_rate']}% ({rate['assessment']}).",
        })
    for w in warnings:
        exceeded = w["status"] == "exceeded"
        msgs.append({
            "type": "budget_warning", "severity": "critical" if exceeded else "warning",
            "message": f"{w['category']} budget {'exceeded' if exceeded else 'nearly used'}: "
                       f"{w['percentage_used']}% used ({_fmt(w['spent'])} of {_fmt(w['monthly_limit'])}).",
        })
    for u in unusual[:3]:
        msgs.append({
            "type": "unusual_expense", "severity": "warning",
            "message": f"Unusually large {u['category']} expense on {u['date']}: {_fmt(u['amount'])} "
                       f"({u['times_typical']}x your typical amount).",
        })
    active = [r for r in recurring if r["status"] == "active"]
    if active:
        total = round(sum(r["estimated_monthly_cost"] for r in active), 2)
        msgs.append({
            "type": "recurring", "severity": "info",
            "message": f"Detected {len(active)} active recurring expense(s) costing about {_fmt(total)} per month.",
        })
    return msgs


def build_insights(user_id, month=None, df=None):
    df = load_frame(user_id) if df is None else df
    month = resolve_month(df, month)
    top = highest_category(df, month)
    change = spending_change(df, month)
    rate = savings_rate(df, month)
    warnings = budget_warnings(user_id, month)
    unusual = unusual_expenses(df, month)
    recurring = recurring_expenses(df)
    return {
        "month": month,
        "highest_spending_category": top,
        "spending_change": change,
        "savings_rate": rate,
        "budget_warnings": warnings,
        "unusual_expenses": unusual,
        "recurring_expenses": recurring,
        "messages": _messages(month, top, change, rate, warnings, unusual, recurring),
    }
