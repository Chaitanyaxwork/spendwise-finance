from services.timeseries import (
    direction_of, is_partial, months_ending, monthly_table, pct_change, r2, resolve_month,
    safe_rate, shift_month,
)

PERIODS = (3, 6, 12)


def month_stats(table, month):
    if month in table.index:
        row = table.loc[month]
        income, expenses = float(row["income"]), float(row["expenses"])
    else:
        income = expenses = 0.0
    savings = income - expenses
    return {
        "income": r2(income),
        "expenses": r2(expenses),
        "savings": r2(savings),
        "savings_rate": safe_rate(savings, income),
    }


def change(current, previous):
    delta = current - previous
    return {
        "amount": r2(delta),
        "percent": pct_change(current, previous),
        "direction": direction_of(delta),
    }


def period_summary(table, end_month, count):
    first = table.index[0] if len(table) else None
    covered = [m for m in months_ending(end_month, count) if first is not None and m >= first]
    window = table.reindex(covered, fill_value=0.0)
    income, expenses = float(window["income"].sum()), float(window["expenses"].sum())
    n = len(covered)
    return {
        "months_requested": count,
        "months_covered": n,
        "complete": n == count,
        "start": covered[0] if covered else None,
        "end": covered[-1] if covered else None,
        "total_income": r2(income),
        "total_expenses": r2(expenses),
        "total_savings": r2(income - expenses),
        "avg_monthly_income": r2(income / n) if n else 0.0,
        "avg_monthly_expenses": r2(expenses / n) if n else 0.0,
        "avg_monthly_savings": r2((income - expenses) / n) if n else 0.0,
        "savings_rate": safe_rate(income - expenses, income),
    }


def build_monthly(df, month=None, today=None):
    table = monthly_table(df)
    month = resolve_month(df, month, today)
    previous = shift_month(month, -1)
    current_stats, previous_stats = month_stats(table, month), month_stats(table, previous)
    chart_months = [m for m in months_ending(month, 12) if len(table) and m >= table.index[0]]
    return {
        "month": month,
        "previous_month": previous,
        "is_partial": is_partial(month, today),
        "has_data": month in table.index,
        "has_previous_data": previous in table.index,
        "current": current_stats,
        "previous": previous_stats,
        "changes": {
            "income": change(current_stats["income"], previous_stats["income"]),
            "expenses": change(current_stats["expenses"], previous_stats["expenses"]),
            "savings": change(current_stats["savings"], previous_stats["savings"]),
        },
        "summaries": {str(n): period_summary(table, month, n) for n in PERIODS},
        "chart": [
            {"month": m, **{k: v for k, v in month_stats(table, m).items() if k != "savings_rate"}}
            for m in chart_months
        ],
    }
