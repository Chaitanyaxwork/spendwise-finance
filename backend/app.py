import os

from flask import Flask
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import HTTPException

from config import get_config
from extensions import cors, db, jwt
from models import TokenBlocklist
from routes import register_blueprints
from utils.responses import error
from utils.validators import ValidationError


def create_app(config_object=None):
    app = Flask(__name__)
    config_object = config_object or get_config()
    config_object.validate()
    app.config.from_object(config_object)
    app.url_map.strict_slashes = False
    app.json.sort_keys = False

    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    register_jwt_callbacks()
    register_error_handlers(app)
    register_blueprints(app)
    register_cli(app)

    if app.config["AUTO_CREATE_TABLES"]:
        with app.app_context():
            db.create_all()
            if not app.config["TESTING"]:
                db.engine.dispose()
    return app


def register_jwt_callbacks():
    @jwt.token_in_blocklist_loader
    def is_revoked(_header, payload):
        return db.session.query(TokenBlocklist.id).filter_by(jti=payload["jti"]).first() is not None

    @jwt.unauthorized_loader
    def missing_token(reason):
        return error("Authentication required", 401, {"reason": reason})

    @jwt.invalid_token_loader
    def invalid_token(reason):
        return error("Invalid token", 401, {"reason": reason})

    @jwt.expired_token_loader
    def expired_token(_header, _payload):
        return error("Token has expired", 401)

    @jwt.revoked_token_loader
    def revoked_token(_header, _payload):
        return error("Token has been revoked", 401)


def register_error_handlers(app):
    @app.errorhandler(ValidationError)
    def handle_validation(exc):
        return error(exc.message, 422, exc.errors)

    @app.errorhandler(HTTPException)
    def handle_http(exc):
        return error(exc.description or exc.name, exc.code)

    @app.errorhandler(SQLAlchemyError)
    def handle_db(exc):
        db.session.rollback()
        app.logger.exception("Database error")
        return error("A database error occurred", 500)

    @app.errorhandler(Exception)
    def handle_unexpected(exc):
        app.logger.exception("Unhandled error")
        return error("Internal server error", 500)


def register_cli(app):
    @app.cli.command("init-db")
    def init_db():
        db.create_all()
        print("Database tables created.")


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=int(os.getenv("PORT", "5001")))
