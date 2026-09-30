from sqlalchemy import func

from models import SavingsGoal
from services.budgets import budgets_with_status, summarize
from services.recurring import detect_recurring, summarize_recurring
from services.timeseries import (
    completed_months, is_partial, months_ending, monthly_table, r2, resolve_month, safe_rate,
)

SAVINGS_RATE_GUIDELINE = 20.0
EMERGENCY_GUIDELINE_MONTHS = (3, 6)
MIN_CONSISTENCY_MONTHS = 3
MIN_RECURRING_HISTORY = 3


def _savings_rate(window, income, expenses):
    monthly = [
        {"month": m, "rate": safe_rate(row["income"] - row["expenses"], row["income"])}
        for m, row in window.iterrows()
    ]
    return {
        "available": income > 0,
        "value": safe_rate(income - expenses, income),
        "income": r2(income),
        "savings": r2(income - expenses),
        "guideline_percent": SAVINGS_RATE_GUIDELINE,
        "monthly": monthly,
    }


def _expense_ratio(income, expenses):
    return {
        "available": income > 0,
        "ratio": round(expenses / income, 4) if income > 0 else None,
        "percent": safe_rate(expenses, income),
        "income": r2(income),
        "expenses": r2(expenses),
    }


def _budget_utilization(items, month):
    if not items:
        return {"available": False, "reason": "No budgets have been created."}
    counts = {"ok": 0, "warning": 0, "exceeded": 0}
    for item in items:
        counts[item["status"]] += 1
    return {"available": True, "month": month, **summarize(items), "budgets": len(items), "status_counts": counts}


def _recurring_ratio(df, table, avg_income, today):
    if len(table) < MIN_RECURRING_HISTORY:
        return {"available": False, "reason": f"At least {MIN_RECURRING_HISTORY} months of history are needed."}
    summary = summarize_recurring(detect_recurring(df, today))
    return {
        "available": avg_income > 0,
        "value": safe_rate(summary["estimated_monthly_total"], avg_income),
        "estimated_monthly_recurring": summary["estimated_monthly_total"],
        "avg_monthly_income": r2(avg_income),
        "active_recurring_count": summary["active_count"],
    }


def _consistency(table, month, today):
    series = table[table.index <= month]
    if is_partial(month, today):
        series = series[series.index < month]
    series = series.tail(12)
    n = len(series)
    if n < MIN_CONSISTENCY_MONTHS:
        return {"available": False, "reason": f"At least {MIN_CONSISTENCY_MONTHS} completed months are needed."}
    positive = int((series["savings"] > 0).sum())
    with_income = series[series["income"] > 0]
    rates = ((with_income["savings"] / with_income["income"]) * 100).to_numpy(dtype=float)
    return {
        "available": True,
        "months_analyzed": n,
        "months_with_positive_savings": positive,
        "positive_savings_percent": r2(positive / n * 100),
        "average_savings_rate": r2(rates.mean()) if len(rates) else None,
        "savings_rate_std_dev": r2(rates.std(ddof=1)) if len(rates) > 1 else None,
    }


def _emergency_fund(goals, table, today):
    if not goals:
        return {"available": False, "reason": "No savings goal with 'emergency' in its name was found."}
    recent = completed_months(table, today).tail(6)
    avg_expenses = float(recent["expenses"].mean()) if len(recent) else 0.0
    current = sum(g["current_amount"] for g in goals)
    target = sum(g["target_amount"] for g in goals)
    return {
        "available": True,
        "goals": [g["name"] for g in goals],
        "current_amount": r2(current),
        "target_amount": r2(target),
        "progress_percentage": r2(min(current / target * 100, 100)) if target else 0.0,
        "avg_monthly_expenses": r2(avg_expenses),
        "months_of_expenses_covered": r2(current / avg_expenses) if avg_expenses > 0 else None,
        "target_months_of_expenses": r2(target / avg_expenses) if avg_expenses > 0 else None,
        "guideline_months": list(EMERGENCY_GUIDELINE_MONTHS),
    }


def compute_health(df, month, months, today, budget_items, emergency_goals):
    table = monthly_table(df)
    first = table.index[0] if len(table) else None
    covered = [m for m in months_ending(month, months) if first is not None and m >= first]
    window = table.reindex(covered, fill_value=0.0)
    income, expenses = float(window["income"].sum()), float(window["expenses"].sum())
    avg_income = income / len(covered) if covered else 0.0

    notes = []
    if is_partial(month, today):
        notes.append(f"{month} is still in progress; its figures are partial.")
    if len(covered) < months:
        notes.append(f"Only {len(covered)} of the requested {months} months have data.")
    return {
        "period": {"end_month": month, "months_requested": months, "months_covered": len(covered)},
        "sufficient_data": len(covered) > 0 and income + expenses > 0,
        "metrics": {
            "savings_rate": _savings_rate(window, income, expenses),
            "expense_to_income_ratio": _expense_ratio(income, expenses),
            "budget_utilization": _budget_utilization(budget_items, month),
            "recurring_expense_ratio": _recurring_ratio(df, table, avg_income, today),
            "savings_consistency": _consistency(table, month, today),
            "emergency_fund": _emergency_fund(emergency_goals, table, today),
        },
        "notes": notes,
    }


def build_health(user_id, df, month=None, months=3, today=None):
    month = resolve_month(df, month, today)
    goals = (
        SavingsGoal.query.filter(SavingsGoal.user_id == user_id, func.lower(SavingsGoal.name).like("%emergency%"))
        .all()
    )
    return compute_health(
        df, month, months, today,
        budgets_with_status(user_id, month),
        [g.to_dict() for g in goals],
    )
