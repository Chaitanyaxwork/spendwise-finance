from datetime import date

import pytest

from extensions import db
from models import Transaction, User
from services.timeseries import shift_month
from tests.conftest import headers_for

ENDPOINTS = ["monthly", "trends", "recurring", "anomalies", "forecast", "health", "report"]
CURRENT = date.today().strftime("%Y-%m")
LAST = shift_month(CURRENT, -1)


def seed_history(app, email="user@example.com", months=12):
    with app.app_context():
        user = User.query.filter_by(email=email).first()
        rows = []

        def add(month, day, amount, tx_type, category, description):
            year, mon = (int(p) for p in month.split("-"))
            rows.append(Transaction(
                user_id=user.id, date=date(year, mon, day), amount=amount,
                type=tx_type, category=category, description=description,
            ))

        for k in range(months, 0, -1):
            month = shift_month(CURRENT, -k)
            add(month, 1, 5000, "income", "Salary", "Monthly salary")
            add(month, 5, 1200, "expense", "Rent & Housing", "Rent")
            add(month, 10, 15.99, "expense", "Entertainment", "Netflix")
            add(month, 12, 50 + (months - k) * 12, "expense", "Transport", "Uber ride")
            add(month, 20, 300 - (months - k) * 10, "expense", "Groceries", "Supermarket run")
            for day, amount in ((3, 41), (9, 44), (17, 39), (24, 46)):
                add(month, day, amount, "expense", "Food & Dining", f"Restaurant {day}")
        add(LAST, 14, 950, "expense", "Food & Dining", "Fancy dinner party")
        db.session.add_all(rows)
        db.session.commit()


def get(client, headers, path):
    return client.get(f"/api/analytics/{path}", headers=headers)


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_requires_auth(client, endpoint):
    res = client.get(f"/api/analytics/{endpoint}")
    assert res.status_code == 401
    assert res.get_json()["success"] is False


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_empty_account_is_graceful(client, auth_headers, endpoint):
    res = get(client, auth_headers, endpoint)
    assert res.status_code == 200
    assert res.get_json()["success"] is True


def test_forecast_reports_insufficient_data(client, auth_headers):
    data = get(client, auth_headers, "forecast").get_json()["data"]
    assert data["sufficient_data"] is False
    assert data["projection"] == []
    assert data["horizons"]["3"]["available"] is False


def test_monthly_comparison(client, app, auth_headers):
    seed_history(app)
    data = get(client, auth_headers, f"monthly?month={LAST}").get_json()["data"]
    assert data["month"] == LAST and data["previous_month"] == shift_month(LAST, -1)
    assert data["is_partial"] is False
    assert data["changes"]["expenses"]["direction"] == "up"
    assert data["changes"]["income"]["percent"] == 0.0
    assert all(data["summaries"][k]["complete"] for k in ("3", "6", "12"))
    assert data["chart"][-1]["month"] == LAST


def test_trends(client, app, auth_headers):
    seed_history(app)
    data = get(client, auth_headers, "trends?months=6").get_json()["data"]
    assert data["sufficient_data"] is True
    assert data["period"]["months_analyzed"] == 6 and data["period"]["end"] == LAST
    assert data["highest_spending_month"]["month"] == LAST
    increasing = [c["category"] for c in data["increasing_categories"]]
    decreasing = [c["category"] for c in data["decreasing_categories"]]
    assert "Transport" in increasing and "Groceries" in decreasing


def test_recurring(client, app, auth_headers):
    seed_history(app)
    data = get(client, auth_headers, "recurring").get_json()["data"]
    found = {r["description"]: r for r in data["recurring"]}
    assert found["Rent"]["frequency"] == "monthly" and found["Rent"]["kind"] == "bill"
    assert found["Netflix"]["kind"] == "subscription"
    assert "Uber ride" not in found and "Monthly salary" not in found
    assert data["summary"]["count"] == len(data["recurring"])
    assert data["sufficient_data"] is True
    lapsed = get(client, auth_headers, "recurring?status=lapsed").get_json()["data"]["recurring"]
    assert all(r["status"] == "lapsed" for r in lapsed)


def test_anomalies(client, app, auth_headers):
    seed_history(app)
    data = get(client, auth_headers, "anomalies").get_json()["data"]
    top = data["anomalies"][0]
    assert top["transaction"]["description"] == "Fancy dinner party"
    assert top["amount"] == 950 and top["category"] == "Food & Dining"
    assert top["expected_range"]["high"] < 950 and top["reason"]
    assert get(client, auth_headers, f"anomalies?month={shift_month(LAST, -3)}").get_json()["data"]["anomalies"] == []


def test_forecast_with_full_history(client, app, auth_headers):
    seed_history(app)
    data = get(client, auth_headers, "forecast").get_json()["data"]
    assert all(data["horizons"][h]["available"] for h in ("3", "6", "12"))
    assert len(data["projection"]) == 12 and data["projection"][0]["month"] == CURRENT
    for row in data["projection"]:
        assert abs(row["savings"] - (row["income"] - row["expenses"])) < 0.02
    assert data["horizons"]["3"]["total_savings"] == pytest.approx(
        data["projection"][2]["cumulative_cash_flow"], abs=0.05
    )


def test_forecast_partial_horizons(client, app, auth_headers):
    seed_history(app, months=4)
    data = get(client, auth_headers, "forecast").get_json()["data"]
    assert data["horizons"]["3"]["available"] is True
    assert data["horizons"]["6"]["available"] is False
    assert len(data["projection"]) == 3


def test_health_metrics(client, app, auth_headers):
    seed_history(app)
    client.post("/api/budgets", json={"category": "Food & Dining", "monthly_limit": 300}, headers=auth_headers)
    client.post(
        "/api/goals",
        json={"name": "Emergency Fund", "target_amount": 10000, "current_amount": 2500},
        headers=auth_headers,
    )
    data = get(client, auth_headers, f"health?month={LAST}&months=3").get_json()["data"]
    metrics = data["metrics"]
    assert set(metrics) == {
        "savings_rate", "expense_to_income_ratio", "budget_utilization",
        "recurring_expense_ratio", "savings_consistency", "emergency_fund",
    }
    assert "score" not in data
    assert metrics["savings_rate"]["available"] and metrics["expense_to_income_ratio"]["percent"] > 0
    assert metrics["budget_utilization"]["status_counts"]["exceeded"] == 1
    assert metrics["emergency_fund"]["progress_percentage"] == 25.0
    assert metrics["savings_consistency"]["months_analyzed"] == 12


def test_health_without_budgets_or_goals(client, app, auth_headers):
    seed_history(app)
    metrics = get(client, auth_headers, "health").get_json()["data"]["metrics"]
    assert metrics["budget_utilization"]["available"] is False
    assert metrics["emergency_fund"]["available"] is False


def test_report(client, app, auth_headers):
    seed_history(app)
    data = get(client, auth_headers, f"report?month={LAST}").get_json()["data"]
    assert {"summary", "category_breakdown", "budget_performance", "recurring_expenses", "key_insights"} <= set(data)
    assert data["summary"]["expenses"] > data["summary"]["income"] * 0.3
    assert sum(c["percentage"] for c in data["category_breakdown"]) == pytest.approx(100, abs=0.1)
    assert any(i["type"] == "unusual_expense" for i in data["key_insights"])


def test_report_pdf_is_optional(client, app, auth_headers):
    seed_history(app)
    res = get(client, auth_headers, f"report?month={LAST}&format=pdf")
    assert res.status_code in (200, 501)
    if res.status_code == 200:
        assert res.data.startswith(b"%PDF")


@pytest.mark.parametrize("path", [
    "monthly?month=2026-13", "trends?months=1", "trends?months=100", "trends?months=abc",
    "recurring?status=bogus", "anomalies?limit=0", "anomalies?limit=1000", "health?months=13",
    "report?format=xml",
])
def test_invalid_params(client, auth_headers, path):
    res = get(client, auth_headers, path)
    assert res.status_code == 422
    assert res.get_json()["error"]["details"]


def test_analytics_are_isolated_per_user(client, app):
    alice = headers_for(client, "alice@example.com")
    bob = headers_for(client, "bob@example.com")
    seed_history(app, "alice@example.com")

    assert get(client, alice, "recurring").get_json()["data"]["summary"]["count"] > 0
    assert get(client, bob, "recurring").get_json()["data"]["summary"]["count"] == 0
    assert get(client, bob, "anomalies").get_json()["data"]["anomalies"] == []
    assert get(client, bob, "forecast").get_json()["data"]["sufficient_data"] is False
    assert get(client, bob, f"report?month={LAST}").get_json()["data"]["summary"]["expenses"] == 0
