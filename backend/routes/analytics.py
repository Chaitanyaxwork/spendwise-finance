from io import BytesIO

from flask import Blueprint, request, send_file
from flask_jwt_extended import jwt_required

from services.anomalies import METHOD as ANOMALY_METHOD, detect_anomalies
from services.forecast import build_forecast
from services.health import build_health
from services.monthly_analytics import build_monthly
from services.recurring import detect_recurring, summarize_recurring
from services.report_pdf import PdfUnavailable, render_report_pdf
from services.reports import build_report
from services.timeseries import load_recent, resolve_month
from services.trends import build_trends
from utils.auth import current_user_id
from utils.responses import error, success
from utils.validators import ValidationError, int_arg, month_arg

bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")


def _bounded(name, default, minimum, maximum):
    value = int_arg(name, default, minimum=minimum)
    if value > maximum:
        raise ValidationError({name: f"Must be at most {maximum}"})
    return value


@bp.get("/monthly")
@jwt_required()
def monthly():
    df = load_recent(current_user_id())
    return success(build_monthly(df, month_arg()))


@bp.get("/trends")
@jwt_required()
def trends():
    months = _bounded("months", 6, 3, 24)
    df = load_recent(current_user_id())
    return success(build_trends(df, months))


@bp.get("/recurring")
@jwt_required()
def recurring():
    status = request.args.get("status", "all").strip().lower()
    if status not in ("all", "active", "lapsed"):
        raise ValidationError({"status": "Must be 'all', 'active' or 'lapsed'"})
    df = load_recent(current_user_id())
    items = detect_recurring(df)
    summary = summarize_recurring(items)
    if status != "all":
        items = [i for i in items if i["status"] == status]
    return success({
        "recurring": items,
        "summary": summary,
        "sufficient_data": not df.empty and df["month"].nunique() >= 3,
    })


@bp.get("/anomalies")
@jwt_required()
def anomalies():
    month = month_arg()
    months = _bounded("months", 12, 1, 36)
    limit = _bounded("limit", 20, 1, 100)
    df = load_recent(current_user_id())
    result = detect_anomalies(df, months=months, month=month, limit=limit)
    return success({
        "anomalies": result["anomalies"],
        "summary": {
            "flagged": result["total_flagged"],
            "returned": len(result["anomalies"]),
            "expenses_analyzed": result["expenses_analyzed"],
            "sufficient_data": result["sufficient_data"],
            "window": month or f"last {months} months",
            "method": ANOMALY_METHOD,
        },
    })


@bp.get("/forecast")
@jwt_required()
def forecast():
    df = load_recent(current_user_id())
    return success(build_forecast(df))


@bp.get("/health")
@jwt_required()
def health():
    months = _bounded("months", 3, 1, 12)
    df = load_recent(current_user_id())
    return success(build_health(current_user_id(), df, month_arg(), months))


@bp.get("/report")
@jwt_required()
def report():
    fmt = request.args.get("format", "json").strip().lower()
    if fmt not in ("json", "pdf"):
        raise ValidationError({"format": "Must be 'json' or 'pdf'"})
    user_id = current_user_id()
    df = load_recent(user_id)
    data = build_report(user_id, df, month_arg())
    if fmt == "json":
        return success(data)
    try:
        pdf = render_report_pdf(data)
    except PdfUnavailable as exc:
        return error(str(exc), 501)
    return send_file(
        BytesIO(pdf), mimetype="application/pdf", as_attachment=True,
        download_name=f"spendwise-report-{data['month']}.pdf",
    )
