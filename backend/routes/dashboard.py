from flask import Blueprint
from flask_jwt_extended import jwt_required

from extensions import db
from models import Transaction
from services import analytics
from utils.auth import current_user_id
from utils.responses import success
from utils.validators import int_arg, month_arg, month_bounds

bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@bp.get("")
@jwt_required()
def dashboard():
    user_id = current_user_id()
    month = month_arg()
    months = int_arg("months", 12, maximum=36)

    df = analytics.load_frame(user_id)
    period = df[df["month"] == month] if month else df

    recent = db.select(Transaction).where(Transaction.user_id == user_id)
    if month:
        start, end = month_bounds(month)
        recent = recent.where(Transaction.date >= start, Transaction.date <= end)
    recent = recent.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(10)

    return success({
        "period": {"month": month or "all"},
        "summary": analytics.totals(period),
        "monthly": analytics.monthly_summary(df, months),
        "category_spending": analytics.category_spending(period),
        "recent_transactions": [t.to_dict() for t in db.session.scalars(recent)],
    })
