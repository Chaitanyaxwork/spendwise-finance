from datetime import datetime, timezone

from flask import Blueprint, current_app, request
from flask_jwt_extended import (
    create_access_token, create_refresh_token, decode_token, get_jwt, get_jwt_identity, jwt_required,
)
from flask_jwt_extended.exceptions import JWTExtendedException
from jwt.exceptions import PyJWTError
from sqlalchemy.exc import IntegrityError

from extensions import db
from models import TokenBlocklist, User
from utils.auth import current_user_id
from utils.responses import error, success
from utils.validators import Validator, clean_str, json_body, validate_email, validate_password

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _access_token(user_id):
    return {
        "access_token": create_access_token(identity=str(user_id)),
        "token_type": "Bearer",
        "expires_in": int(current_app.config["JWT_ACCESS_TOKEN_EXPIRES"].total_seconds()),
    }


def _tokens(user):
    return {**_access_token(user.id), "refresh_token": create_refresh_token(identity=str(user.id))}


def _revoke(jti, token_type, user_id, exp):
    if db.session.query(TokenBlocklist.id).filter_by(jti=jti).first():
        return
    db.session.add(TokenBlocklist(
        jti=jti, token_type=token_type, user_id=user_id,
        expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
    ))


@bp.post("/register")
def register():
    data = json_body()
    v = Validator()
    name = v.run("name", clean_str, data.get("name"), 100, required=True)
    email = v.run("email", validate_email, data.get("email"))
    password = v.run("password", validate_password, data.get("password"))
    v.check()

    if User.query.filter_by(email=email).first():
        return error("Email is already registered", 409)
    user = User(name=name, email=email)
    user.set_password(password)
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("Email is already registered", 409)
    return success({"user": user.to_dict(), **_tokens(user)}, 201)


@bp.post("/login")
def login():
    data = json_body()
    email, password = data.get("email"), data.get("password")
    if not isinstance(email, str) or not isinstance(password, str) or not email.strip() or not password:
        return error("Email and password are required", 422)
    user = User.query.filter_by(email=email.strip().lower()).first()
    if not user or not user.check_password(password):
        return error("Invalid email or password", 401)
    return success({"user": user.to_dict(), **_tokens(user)})


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    user_id = current_user_id()
    if not db.session.get(User, user_id):
        return error("User no longer exists", 401)
    return success(_access_token(user_id))


@bp.post("/logout")
@jwt_required()
def logout():
    claims = get_jwt()
    user_id = current_user_id()
    _revoke(claims["jti"], claims["type"], user_id, claims["exp"])

    body = request.get_json(silent=True)
    refresh_token = body.get("refresh_token") if isinstance(body, dict) else None
    if isinstance(refresh_token, str) and refresh_token:
        try:
            decoded = decode_token(refresh_token)
            if decoded.get("type") == "refresh" and decoded.get("sub") == get_jwt_identity():
                _revoke(decoded["jti"], "refresh", user_id, decoded["exp"])
        except (JWTExtendedException, PyJWTError):
            pass

    TokenBlocklist.query.filter(TokenBlocklist.expires_at < datetime.now(timezone.utc)).delete()
    db.session.commit()
    return success({"message": "Logged out"})


@bp.get("/me")
@jwt_required()
def me():
    user = db.session.get(User, current_user_id())
    if not user:
        return error("User not found", 404)
    return success({"user": user.to_dict()})
