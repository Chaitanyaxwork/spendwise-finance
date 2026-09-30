import re
from statistics import median

import pandas as pd

from services.timeseries import today_or

FREQUENCIES = (
    # name, median gap range, allowed gap range, monthly factor, minimum occurrences
    ("weekly", (6, 8), (5, 9), 52 / 12, 3),
    ("biweekly", (13, 15), (12, 17), 26 / 12, 3),
    ("monthly", (27, 33), (25, 36), 1.0, 3),
    ("quarterly", (85, 95), (80, 100), 1 / 3, 3),
    ("yearly", (355, 375), (350, 380), 1 / 12, 2),
)
AMOUNT_TOLERANCE = 0.15
SHORT_CYCLE_TOLERANCE = 0.05
FIXED_TOLERANCE = 0.02
MIN_REGULARITY = 0.8
NOISE_WORDS = {
    "payment", "pay", "bill", "autopay", "auto", "subscription", "monthly", "invoice", "ref",
    "txn", "transaction", "recurring", "charge", "debit", "online", "purchase", "pos", "upi",
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
    "january", "february", "march", "april", "june", "july", "august", "september",
    "october", "november", "december",
}
SUBSCRIPTION_CATEGORIES = {"Entertainment", "Subscriptions"}
BILL_CATEGORIES = {"Rent & Housing", "Utilities", "Insurance", "Fees & Taxes"}


def normalize_key(description):
    text = re.sub(r"[^a-z\s]", " ", description.lower())
    return " ".join(t for t in text.split() if len(t) > 1 and t not in NOISE_WORDS)


def _kind(category):
    if category in SUBSCRIPTION_CATEGORIES:
        return "subscription"
    if category in BILL_CATEGORIES:
        return "bill"
    return "recurring"


def _frequency(gaps, occurrences):
    gap = float(median(gaps))
    for name, gap_range, allowed, factor, minimum in FREQUENCIES:
        if occurrences < minimum or not gap_range[0] <= gap <= gap_range[1]:
            continue
        regular = sum(1 for g in gaps if allowed[0] <= g <= allowed[1]) / len(gaps)
        if regular >= MIN_REGULARITY:
            return name, factor, gap, regular
    return None


def detect_recurring(df, today=None):
    today = pd.Timestamp(today_or(today))
    expenses = df[(df["type"] == "expense") & (df["description"].str.strip() != "")].copy()
    if expenses.empty:
        return []
    expenses["key"] = expenses["description"].map(normalize_key)
    expenses = expenses[expenses["key"] != ""]

    items = []
    for _, group in expenses.groupby("key"):
        if len(group) < 2:
            continue
        group = group.sort_values("date")
        amounts = group["amount"].astype(float)
        typical = float(amounts.median())
        if typical <= 0:
            continue
        deviation = float((amounts - typical).abs().max()) / typical
        if deviation > AMOUNT_TOLERANCE:
            continue
        gaps = group["date"].diff().dt.days.dropna().astype(int).tolist()
        detected = _frequency(gaps, len(group))
        if not detected:
            continue
        name, factor, gap, regular = detected
        if name in ("weekly", "biweekly") and deviation > SHORT_CYCLE_TOLERANCE:
            continue
        first, last = group.iloc[0], group.iloc[-1]
        interval = int(round(gap))
        days_since = int((today - last["date"]).days)
        average = float(amounts.mean())
        active = days_since <= interval * 1.5
        confident = len(group) >= 4 and regular == 1.0 and deviation <= 0.05
        items.append({
            "description": last["description"],
            "category": last["category"],
            "kind": _kind(last["category"]),
            "frequency": name,
            "interval_days": interval,
            "occurrences": int(len(group)),
            "average_amount": round(average, 2),
            "last_amount": round(float(last["amount"]), 2),
            "amount_type": "fixed" if deviation <= FIXED_TOLERANCE else "variable",
            "amount_variation_percent": round(deviation * 100, 2),
            "first_date": first["date"].strftime("%Y-%m-%d"),
            "last_date": last["date"].strftime("%Y-%m-%d"),
            "next_expected_date": (last["date"] + pd.Timedelta(days=interval)).strftime("%Y-%m-%d"),
            "status": "active" if active else "lapsed",
            "estimated_monthly_cost": round(average * factor, 2),
            "confidence": "high" if confident else "medium",
            "transaction_ids": [int(i) for i in group["id"].tail(12)],
        })
    items.sort(key=lambda r: (r["status"] != "active", -r["estimated_monthly_cost"]))
    return items


def summarize_recurring(items):
    active = [i for i in items if i["status"] == "active"]
    by_frequency, by_kind = {}, {}
    for item in active:
        by_frequency[item["frequency"]] = by_frequency.get(item["frequency"], 0) + 1
        by_kind[item["kind"]] = round(by_kind.get(item["kind"], 0) + item["estimated_monthly_cost"], 2)
    return {
        "count": len(items),
        "active_count": len(active),
        "lapsed_count": len(items) - len(active),
        "estimated_monthly_total": round(sum(i["estimated_monthly_cost"] for i in active), 2),
        "estimated_yearly_total": round(sum(i["estimated_monthly_cost"] for i in active) * 12, 2),
        "active_by_frequency": by_frequency,
        "monthly_cost_by_kind": by_kind,
    }
