import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()

DEV_SECRET = os.getenv("DEV_SECRET", "change-me-in-local-env")
DEV_JWT_SECRET = os.getenv("DEV_JWT_SECRET", "change-me-in-local-env")
DEFAULT_ORIGINS = (
    "http://localhost:3000,http://localhost:5173,http://localhost:8000,http://127.0.0.1:8000,"
    "http://localhost:5500,http://127.0.0.1:5500"
)


def _database_url():
    url = os.getenv("DATABASE_URL", "sqlite:///spendwise.db")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


def _origins():
    raw = os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS).strip()
    if raw == "*":
        return "*"
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def _bool(name, default):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes")


class Config:
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.getenv("SECRET_KEY", DEV_SECRET)
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", DEV_JWT_SECRET)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "60")))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "30")))
    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    CORS_ORIGINS = _origins()
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_UPLOAD_MB", "2")) * 1024 * 1024
    MAX_IMPORT_ROWS = int(os.getenv("MAX_IMPORT_ROWS", "5000"))
    AUTO_CREATE_TABLES = _bool("AUTO_CREATE_TABLES", True)

    @classmethod
    def validate(cls):
        pass


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    @classmethod
    def validate(cls):
        if cls.SECRET_KEY == DEV_SECRET or cls.JWT_SECRET_KEY == DEV_JWT_SECRET:
            raise RuntimeError("SECRET_KEY and JWT_SECRET_KEY must be set in production")
        if cls.SQLALCHEMY_DATABASE_URI.startswith("sqlite"):
            raise RuntimeError("DATABASE_URL must point to PostgreSQL in production")


class TestingConfig(Config):
    TESTING = True
    SECRET_KEY = "test-secret-key-0123456789-0123456789"
    JWT_SECRET_KEY = "test-jwt-secret-key-0123456789-0123456789"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    AUTO_CREATE_TABLES = True


def get_config():
    env = os.getenv("APP_ENV", "development").lower()
    return ProductionConfig if env == "production" else DevelopmentConfig
