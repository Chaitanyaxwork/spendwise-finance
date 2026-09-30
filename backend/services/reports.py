from services.analytics import category_spending
from services.monthly_analytics import change, month_stats
from services.recurring import detect_recurring, summarize_recurring
from services.timeseries import is_partial, monthly_table, resolve_month, shift_month, today_or
from services.budgets import budgets_with_status, summarize
from services.insights import build_insights


def compute_report(df, month, today, budget_items, insight_messages):
    today = today_or(today)
    table = monthly_table(df)
    previous = shift_month(month, -1)
    current, prior = month_stats(table, month), month_stats(table, previous)

    in_month = df[df["month"] == month]
    previous_spend = {c["category"]: c["amount"] for c in category_spending(df[df["month"] == previous])}
    breakdown = []
    for item in category_spending(in_month):
        before = previous_spend.get(item["category"])
        breakdown.append({
            **item,
            "previous_amount": before if before is not None else 0.0,
            "change_percent": round((item["amount"] - before) / before * 100, 2) if before else None,
        })

    recurring = [r for r in detect_recurring(df, today) if r["status"] == "active"]
    return {
        "month": month,
        "previous_month": previous,
        "generated_on": today.isoformat(),
        "is_partial": is_partial(month, today),
        "summary": {
            **current,
            "transaction_count": int(len(in_month)),
            "vs_previous_month": {
                "income": change(current["income"], prior["income"]),
                "expenses": change(current["expenses"], prior["expenses"]),
                "savings": change(current["savings"], prior["savings"]),
            },
        },
        "category_breakdown": breakdown,
        "budget_performance": {"budgets": budget_items, "summary": summarize(budget_items)},
        "recurring_expenses": {"items": recurring, "summary": summarize_recurring(recurring)},
        "key_insights": insight_messages,
    }


def build_report(user_id, df, month=None, today=None):
    month = resolve_month(df, month, today)
    insights = build_insights(user_id, month, df=df)
    return compute_report(df, month, today, budgets_with_status(user_id, month), insights["messages"])
