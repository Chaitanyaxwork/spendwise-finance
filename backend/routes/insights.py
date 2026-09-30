from flask import Blueprint
from flask_jwt_extended import jwt_required

from services import insights as service
from services.analytics import load_frame
from utils.auth import current_user_id
from utils.responses import success
from utils.validators import month_arg

bp = Blueprint("insights", __name__, url_prefix="/api/insights")


@bp.get("")
@jwt_required()
def all_insights():
    return success(service.build_insights(current_user_id(), month_arg()))


@bp.get("/recurring")
@jwt_required()
def recurring():
    return success(service.recurring_expenses(load_frame(current_user_id())))


@bp.get("/unusual")
@jwt_required()
def unusual():
    df = load_frame(current_user_id())
    month = service.resolve_month(df, month_arg())
    return success(service.unusual_expenses(df, month), month=month)
