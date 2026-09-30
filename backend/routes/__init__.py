from flask import Blueprint

from utils.responses import success

from . import analytics, auth, budgets, dashboard, goals, imports, insights, simulator, transactions

health_bp = Blueprint("health", __name__, url_prefix="/api")


@health_bp.get("/health")
def health():
    return success({"status": "ok"})


def register_blueprints(app):
    for bp in (
        health_bp, auth.bp, transactions.bp, dashboard.bp, budgets.bp,
        goals.bp, insights.bp, simulator.bp, imports.bp, analytics.bp,
    ):
        app.register_blueprint(bp)
