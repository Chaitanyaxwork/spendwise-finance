from sqlalchemy import func

from extensions import db
from models import Budget, Transaction
from utils.validators import month_bounds


def spent_by_category(user_id, start, end):
    rows = (
        db.session.query(Transaction.category, func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(Transaction.category)
        .all()
    )
    return {category: float(total or 0) for category, total in rows}


def budget_status(budget, spent, month):
    limit = float(budget.monthly_limit)
    spent = round(spent, 2)
    pct = round(spent / limit * 100, 2) if limit else 0.0
    status = "exceeded" if pct > 100 else "warning" if pct >= 80 else "ok"
    return {
        **budget.to_dict(),
        "month": month,
        "spent": spent,
        "remaining": round(max(limit - spent, 0), 2),
        "overspent": round(max(spent - limit, 0), 2),
        "percentage_used": pct,
        "status": status,
    }


def budgets_with_status(user_id, month):
    start, end = month_bounds(month)
    spent = spent_by_category(user_id, start, end)
    budgets = Budget.query.filter_by(user_id=user_id).order_by(Budget.category).all()
    return [budget_status(b, spent.get(b.category, 0.0), month) for b in budgets]


def single_status(budget, month):
    start, end = month_bounds(month)
    spent = spent_by_category(budget.user_id, start, end).get(budget.category, 0.0)
    return budget_status(budget, spent, month)


def summarize(items):
    limit = round(sum(i["monthly_limit"] for i in items), 2)
    spent = round(sum(i["spent"] for i in items), 2)
    return {
        "total_limit": limit,
        "total_spent": spent,
        "total_remaining": round(max(limit - spent, 0), 2),
        "percentage_used": round(spent / limit * 100, 2) if limit else 0.0,
    }
