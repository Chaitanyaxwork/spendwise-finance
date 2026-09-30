from datetime import date

import pandas as pd

from services.analytics import load_frame

LOOKBACK_MONTHS = 36
SERIES_COLUMNS = ["income", "expenses", "savings"]


def today_or(today):
    return today or date.today()


def month_of(day):
    return day.strftime("%Y-%m")


def shift_month(month, delta):
    year, mon = (int(p) for p in month.split("-"))
    index = year * 12 + (mon - 1) + delta
    return f"{index // 12}-{index % 12 + 1:02d}"


def load_recent(user_id, today=None):
    current = month_of(today_or(today))
    since = date.fromisoformat(shift_month(current, -(LOOKBACK_MONTHS - 1)) + "-01")
    return load_frame(user_id, since=since)


def resolve_month(df, month, today=None):
    if month:
        return month
    current = month_of(today_or(today))
    if df.empty or (df["month"] == current).any():
        return current
    return str(df["month"].max())


def is_partial(month, today=None):
    return month >= month_of(today_or(today))


def monthly_table(df):
    if df.empty:
        return pd.DataFrame({c: pd.Series(dtype=float) for c in SERIES_COLUMNS}, index=pd.Index([], dtype=object))
    pivot = df.pivot_table(index="month", columns="type", values="amount", aggfunc="sum", fill_value=0.0)
    for col in ("income", "expense"):
        if col not in pivot.columns:
            pivot[col] = 0.0
    index = list(pd.period_range(pivot.index.min(), pivot.index.max(), freq="M").strftime("%Y-%m"))
    pivot = pivot.reindex(index, fill_value=0.0)
    table = pd.DataFrame({"income": pivot["income"], "expenses": pivot["expense"]})
    table["savings"] = table["income"] - table["expenses"]
    return table


def completed_months(table, today=None):
    if table.empty:
        return table
    return table[table.index < month_of(today_or(today))]


def months_ending(month, count):
    return [shift_month(month, -i) for i in range(count - 1, -1, -1)]


def pct_change(new, old):
    if old is None or old == 0:
        return None
    return round((new - old) / abs(old) * 100, 2)


def direction_of(delta, eps=0.005):
    return "up" if delta > eps else "down" if delta < -eps else "flat"


def safe_rate(numerator, denominator, digits=2):
    if not denominator or denominator <= 0:
        return None
    return round(numerator / denominator * 100, digits)


def r2(value):
    return round(float(value), 2)
