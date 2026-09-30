import pytest

from app import create_app
from config import TestingConfig
from extensions import db


@pytest.fixture()
def app():
    app = create_app(TestingConfig)
    yield app
    with app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def register_user(client, email="user@example.com", password="Passw0rd123", name="Test User"):
    return client.post("/api/auth/register", json={"name": name, "email": email, "password": password})


def headers_for(client, email="user@example.com"):
    token = register_user(client, email=email).get_json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def auth_headers(client):
    return headers_for(client)
