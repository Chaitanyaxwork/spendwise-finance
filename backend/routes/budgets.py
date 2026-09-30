from flask import Blueprint
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import IntegrityError

from extensions import db
from models import Budget
from services import budgets as service
from utils.auth import current_user_id
from utils.responses import error, success
from utils.validators import (
    Validator, clean_str, current_month, json_body, month_arg, normalize_category, parse_amount,
)

bp = Blueprint("budgets", __name__, url_prefix="/api/budgets")


def _get_owned(budget_id):
    return Budget.query.filter_by(id=budget_id, user_id=current_user_id()).first()


def _parse(data, partial=False):
    v = Validator()
    out = {}
    if not partial or "category" in data:
        category = v.run("category", clean_str, data.get("category"), 50, required=True)
        out["category"] = normalize_category(category) if category else None
    if not partial or "monthly_limit" in data:
        out["monthly_limit"] = v.run("monthly_limit", parse_amount, data.get("monthly_limit"))
    v.check()
    return out


@bp.get("")
@jwt_required()
def list_budgets():
    month = month_arg() or current_month()
    items = service.budgets_with_status(current_user_id(), month)
    return success(items, month=month, summary=service.summarize(items))


@bp.post("")
@jwt_required()
def create_budget():
    fields = _parse(json_body())
    user_id = current_user_id()
    if Budget.query.filter_by(user_id=user_id, category=fields["category"]).first():
        return error("A budget for this category already exists", 409)
    budget = Budget(user_id=user_id, **fields)
    db.session.add(budget)
    db.session.commit()
    return success(service.single_status(budget, current_month()), 201)


@bp.route("/<int:budget_id>", methods=["PUT", "PATCH"])
@jwt_required()
def update_budget(budget_id):
    budget = _get_owned(budget_id)
    if not budget:
        return error("Budget not found", 404)
    fields = _parse(json_body(), partial=True)
    if "category" in fields and fields["category"] != budget.category:
        clash = Budget.query.filter_by(user_id=budget.user_id, category=fields["category"]).first()
        if clash:
            return error("A budget for this category already exists", 409)
    for key, value in fields.items():
        setattr(budget, key, value)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("A budget for this category already exists", 409)
    return success(service.single_status(budget, month_arg() or current_month()))


@bp.delete("/<int:budget_id>")
@jwt_required()
def delete_budget(budget_id):
    budget = _get_owned(budget_id)
    if not budget:
        return error("Budget not found", 404)
    db.session.delete(budget)
    db.session.commit()
    return success({"message": "Budget deleted"})
