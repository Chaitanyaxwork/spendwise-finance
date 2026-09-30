from tests.conftest import register_user


def test_register_success_hides_password(client):
    res = register_user(client)
    body = res.get_json()
    assert res.status_code == 201
    assert body["success"] is True
    assert body["data"]["user"]["email"] == "user@example.com"
    assert body["data"]["access_token"] and body["data"]["refresh_token"]
    assert "password" not in res.get_data(as_text=True).lower()


def test_register_duplicate_email(client):
    register_user(client)
    res = register_user(client, email="USER@example.com")
    assert res.status_code == 409
    assert res.get_json()["success"] is False


def test_register_validation_errors(client):
    res = client.post("/api/auth/register", json={"name": "", "email": "nope", "password": "short"})
    assert res.status_code == 422
    details = res.get_json()["error"]["details"]
    assert {"name", "email", "password"} <= set(details)


def test_register_rejects_non_json(client):
    res = client.post("/api/auth/register", data="not json", content_type="text/plain")
    assert res.status_code == 400


def test_login_success_and_failure(client):
    register_user(client)
    ok = client.post("/api/auth/login", json={"email": "user@example.com", "password": "Passw0rd123"})
    assert ok.status_code == 200
    assert ok.get_json()["data"]["access_token"]

    bad = client.post("/api/auth/login", json={"email": "user@example.com", "password": "wrong-pass1"})
    assert bad.status_code == 401
    unknown = client.post("/api/auth/login", json={"email": "who@example.com", "password": "Passw0rd123"})
    assert unknown.status_code == 401


def test_me_requires_token(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 401
    assert res.get_json()["success"] is False


def test_me_returns_current_user(client, auth_headers):
    res = client.get("/api/auth/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json()["data"]["user"]["email"] == "user@example.com"


def test_logout_revokes_token(client, auth_headers):
    assert client.post("/api/auth/logout", headers=auth_headers).status_code == 200
    assert client.get("/api/auth/me", headers=auth_headers).status_code == 401


def test_refresh_returns_new_access_token(client):
    tokens = register_user(client).get_json()["data"]
    res = client.post("/api/auth/refresh", headers={"Authorization": f"Bearer {tokens['refresh_token']}"})
    assert res.status_code == 200
    assert res.get_json()["data"]["access_token"]

    as_access = client.post("/api/auth/refresh", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert as_access.status_code == 401
