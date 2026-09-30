from tests.conftest import headers_for


def make(client, headers, **overrides):
    payload = {
        "amount": 100, "type": "expense", "category": "Food",
        "description": "Lunch", "date": "2026-09-10",
    }
    payload.update(overrides)
    return client.post("/api/transactions", json=payload, headers=headers)


def test_requires_auth(client):
    assert client.get("/api/transactions").status_code == 401
    assert client.post("/api/transactions", json={}).status_code == 401


def test_create_transaction(client, auth_headers):
    res = make(client, auth_headers, amount="12.345")
    body = res.get_json()
    assert res.status_code == 201
    assert body["data"]["amount"] == 12.35
    assert body["data"]["category"] == "Food"
    assert body["data"]["date"] == "2026-09-10"


def test_create_validation_errors(client, auth_headers):
    res = client.post(
        "/api/transactions",
        json={"amount": -5, "type": "transfer", "date": "10/09/2026"},
        headers=auth_headers,
    )
    assert res.status_code == 422
    assert {"amount", "type", "date"} <= set(res.get_json()["error"]["details"])


def test_auto_categorization_and_default_category(client, auth_headers):
    coffee = make(client, auth_headers, category=None, description="Starbucks coffee").get_json()["data"]
    assert coffee["category"] == "Food & Dining"
    other = make(client, auth_headers, category=None, description="Something odd").get_json()["data"]
    assert other["category"] == "Uncategorized"


def test_list_filters_and_pagination(client, auth_headers):
    make(client, auth_headers, amount=50, category="Food", date="2026-09-01")
    make(client, auth_headers, amount=60, category="Transport", date="2026-09-15")
    make(client, auth_headers, amount=70, category="Food", date="2026-08-20")
    make(client, auth_headers, amount=5000, type="income", category="Salary", date="2026-09-01")

    def fetch(query):
        return client.get(f"/api/transactions?{query}", headers=auth_headers).get_json()

    assert fetch("")["pagination"]["total"] == 4
    assert fetch("type=income")["pagination"]["total"] == 1
    assert fetch("category=food")["pagination"]["total"] == 2
    assert fetch("month=2026-09")["pagination"]["total"] == 3
    assert fetch("date_from=2026-09-10&date_to=2026-09-30")["pagination"]["total"] == 1

    page = fetch("per_page=2&page=2")
    assert len(page["data"]) == 2
    assert page["pagination"]["pages"] == 2 and page["pagination"]["has_prev"] is True

    bad = client.get("/api/transactions?month=2026-13", headers=auth_headers)
    assert bad.status_code == 422


def test_get_update_delete(client, auth_headers):
    tx_id = make(client, auth_headers).get_json()["data"]["id"]

    got = client.get(f"/api/transactions/{tx_id}", headers=auth_headers)
    assert got.status_code == 200

    updated = client.put(
        f"/api/transactions/{tx_id}", json={"amount": 250, "description": "Dinner"}, headers=auth_headers
    )
    assert updated.status_code == 200
    assert updated.get_json()["data"]["amount"] == 250
    assert updated.get_json()["data"]["description"] == "Dinner"
    assert updated.get_json()["data"]["category"] == "Food"

    assert client.delete(f"/api/transactions/{tx_id}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/transactions/{tx_id}", headers=auth_headers).status_code == 404


def test_users_cannot_access_each_others_data(client):
    alice = headers_for(client, "alice@example.com")
    bob = headers_for(client, "bob@example.com")
    tx_id = make(client, alice).get_json()["data"]["id"]

    assert client.get(f"/api/transactions/{tx_id}", headers=bob).status_code == 404
    assert client.put(f"/api/transactions/{tx_id}", json={"amount": 1}, headers=bob).status_code == 404
    assert client.delete(f"/api/transactions/{tx_id}", headers=bob).status_code == 404
    assert client.get("/api/transactions", headers=bob).get_json()["pagination"]["total"] == 0
    assert client.get(f"/api/transactions/{tx_id}", headers=alice).status_code == 200
