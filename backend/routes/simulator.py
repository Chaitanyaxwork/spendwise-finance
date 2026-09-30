from flask import Blueprint
from flask_jwt_extended import jwt_required

from services.simulator import simulate
from utils.responses import success
from utils.validators import Validator, json_body, parse_amount, parse_int, parse_rate

bp = Blueprint("simulator", __name__, url_prefix="/api/simulator")


@bp.post("")
@jwt_required()
def run_simulation():
    data = json_body()
    v = Validator()
    income = v.run("monthly_income", parse_amount, data.get("monthly_income"), allow_zero=True)
    expenses = v.run("monthly_expenses", parse_amount, data.get("monthly_expenses"), allow_zero=True)
    savings = v.run("monthly_savings", parse_amount, data.get("monthly_savings"), allow_zero=True)
    years = v.run("years", parse_int, data.get("years"), 1, 50)
    rate = v.run("annual_return_rate", parse_rate, data.get("annual_return_rate"))
    v.check()
    return success(simulate(income, expenses, savings, years, rate))
