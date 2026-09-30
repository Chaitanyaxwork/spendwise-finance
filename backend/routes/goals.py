from flask import Blueprint
from flask_jwt_extended import jwt_required

from extensions import db
from models import SavingsGoal
from utils.auth import current_user_id
from utils.responses import error, success
from utils.validators import Validator, clean_str, json_body, parse_amount, parse_date

bp = Blueprint("goals", __name__, url_prefix="/api/goals")


def _get_owned(goal_id):
    return SavingsGoal.query.filter_by(id=goal_id, user_id=current_user_id()).first()


def _parse(data, partial=False):
    v = Validator()
    out = {}
    if not partial or "name" in data:
        out["name"] = v.run("name", clean_str, data.get("name"), 100, required=True)
    if not partial or "target_amount" in data:
        out["target_amount"] = v.run("target_amount", parse_amount, data.get("target_amount"))
    if "current_amount" in data:
        out["current_amount"] = v.run("current_amount", parse_amount, data.get("current_amount"), allow_zero=True)
    elif not partial:
        out["current_amount"] = 0.0
    if "target_date" in data:
        raw = data.get("target_date")
        out["target_date"] = None if raw in (None, "") else v.run("target_date", parse_date, raw)
    v.check()
    return out


@bp.get("")
@jwt_required()
def list_goals():
    goals = SavingsGoal.query.filter_by(user_id=current_user_id()).order_by(SavingsGoal.created_at.desc()).all()
    return success([g.to_dict() for g in goals])


@bp.post("")
@jwt_required()
def create_goal():
    goal = SavingsGoal(user_id=current_user_id(), **_parse(json_body()))
    db.session.add(goal)
    db.session.commit()
    return success(goal.to_dict(), 201)


@bp.route("/<int:goal_id>", methods=["PUT", "PATCH"])
@jwt_required()
def update_goal(goal_id):
    goal = _get_owned(goal_id)
    if not goal:
        return error("Goal not found", 404)
    for key, value in _parse(json_body(), partial=True).items():
        setattr(goal, key, value)
    db.session.commit()
    return success(goal.to_dict())


@bp.delete("/<int:goal_id>")
@jwt_required()
def delete_goal(goal_id):
    goal = _get_owned(goal_id)
    if not goal:
        return error("Goal not found", 404)
    db.session.delete(goal)
    db.session.commit()
    return success({"message": "Goal deleted"})
