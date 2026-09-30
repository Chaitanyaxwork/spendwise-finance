import pandas as pd

from extensions import db
from models import Transaction

COLUMNS = ["id", "amount", "type", "category", "description", "date"]


def load_frame(user_id, since=None):
    query = db.session.query(
        Transaction.id, Transaction.amount, Transaction.type,
        Transaction.category, Transaction.description, Transaction.date,
    ).filter(Transaction.user_id == user_id)
    if since is not None:
        query = query.filter(Transaction.date >= since)
    return build_frame([tuple(r) for r in query.all()])


def build_frame(rows):
    df = pd.DataFrame(rows, columns=COLUMNS)
    df["amount"] = df["amount"].astype(float)
    df["description"] = df["description"].fillna("").astype(str)
    df["date"] = pd.to_datetime(df["date"])
    df["month"] = df["date"].dt.strftime("%Y-%m")
    return df


def totals(df):
    income = float(df.loc[df["type"] == "income", "amount"].sum())
    expenses = float(df.loc[df["type"] == "expense", "amount"].sum())
    savings = income - expenses
    return {
        "total_income": round(income, 2),
        "total_expenses": round(expenses, 2),
        "total_savings": round(savings, 2),
        "savings_percentage": round(savings / income * 100, 2) if income > 0 else 0.0,
    }


def monthly_summary(df, months=12):
    if df.empty:
        return []
    pivot = df.pivot_table(index="month", columns="type", values="amount", aggfunc="sum", fill_value=0.0)
    for col in ("income", "expense"):
        if col not in pivot.columns:
            pivot[col] = 0.0
    full_range = pd.period_range(pivot.index.min(), pivot.index.max(), freq="M").strftime("%Y-%m")
    pivot = pivot.reindex(list(full_range), fill_value=0.0).tail(months)
    return [
        {
            "month": month,
            "income": round(float(row["income"]), 2),
            "expenses": round(float(row["expense"]), 2),
            "savings": round(float(row["income"] - row["expense"]), 2),
        }
        for month, row in pivot.iterrows()
    ]


def category_spending(df):
    expenses = df[df["type"] == "expense"]
    if expenses.empty:
        return []
    grouped = expenses.groupby("category")["amount"].agg(["sum", "count"]).sort_values("sum", ascending=False)
    total = float(grouped["sum"].sum())
    return [
        {
            "category": category,
            "amount": round(float(row["sum"]), 2),
            "transactions": int(row["count"]),
            "percentage": round(float(row["sum"]) / total * 100, 2) if total else 0.0,
        }
        for category, row in grouped.iterrows()
    ]
