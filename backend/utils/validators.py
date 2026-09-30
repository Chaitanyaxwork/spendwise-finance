import calendar
import re
import string
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from flask import request
from werkzeug.exceptions import BadRequest

MAX_AMOUNT = Decimal("9999999999.99")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ISO_FORMATS = ("%Y-%m-%d",)
LENIENT_FORMATS = (
    "%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d %b %Y", "%d-%b-%Y",
)
TRANSACTION_TYPES = ("income", "expense")


class ValidationError(Exception):
    def __init__(self, errors, message="Validation failed"):
        super().__init__(message)
        self.message = message
        self.errors = errors if isinstance(errors, dict) else {"_": str(errors)}


class Validator:
    def __init__(self):
        self.errors = {}

    def run(self, field, fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ValueError as exc:
            self.errors[field] = str(exc)
            return None

    def check(self):
        if self.errors:
            raise ValidationError(self.errors)


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise BadRequest("Request body must be a JSON object")
    return data


def clean_str(value, max_len, required=False):
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ValueError("This field is required")
        return None
    if not isinstance(value, str):
        raise ValueError("Must be a string")
    value = " ".join(value.split())
    if len(value) > max_len:
        raise ValueError(f"Must be at most {max_len} characters")
    return value


def normalize_category(value):
    return string.capwords(value)


def parse_amount(value, allow_zero=False):
    if value is None or isinstance(value, bool) or (isinstance(value, str) and not value.strip()):
        raise ValueError("This field is required")
    try:
        number = Decimal(str(value).strip())
    except InvalidOperation:
        raise ValueError("Must be a valid number")
    if not number.is_finite():
        raise ValueError("Must be a valid number")
    if number.copy_abs() > MAX_AMOUNT:
        raise ValueError("Value is too large")
    number = number.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if number < 0:
        raise ValueError("Must not be negative")
    if number == 0 and not allow_zero:
        raise ValueError("Must be greater than 0")
    return float(number)


def parse_rate(value, maximum=50.0):
    if value is None or value == "":
        return 0.0
    if isinstance(value, bool):
        raise ValueError("Must be a number")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError("Must be a number")
    if number != number or number < 0 or number > maximum:
        raise ValueError(f"Must be between 0 and {maximum:g}")
    return number


def parse_date(value, lenient=False):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("This field is required")
    for fmt in (LENIENT_FORMATS if lenient else ISO_FORMATS):
        try:
            parsed = datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
        if 1900 <= parsed.year <= 2100:
            return parsed
    raise ValueError("Invalid date; use YYYY-MM-DD")


def parse_month(value):
    try:
        return datetime.strptime(str(value).strip(), "%Y-%m").strftime("%Y-%m")
    except ValueError:
        raise ValueError("Invalid month; use YYYY-MM")


def parse_type(value):
    if not isinstance(value, str) or value.strip().lower() not in TRANSACTION_TYPES:
        raise ValueError("Must be 'income' or 'expense'")
    return value.strip().lower()


def parse_int(value, minimum, maximum):
    if isinstance(value, bool):
        raise ValueError("Must be an integer")
    try:
        number = int(value)
        if isinstance(value, float) and value != number:
            raise ValueError
    except (TypeError, ValueError):
        raise ValueError("Must be an integer")
    if number < minimum or number > maximum:
        raise ValueError(f"Must be between {minimum} and {maximum}")
    return number


def validate_email(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("This field is required")
    value = value.strip().lower()
    if len(value) > 255 or not EMAIL_RE.match(value):
        raise ValueError("Invalid email address")
    return value


def validate_password(value):
    if not isinstance(value, str) or not value:
        raise ValueError("This field is required")
    if len(value) < 8 or len(value) > 128:
        raise ValueError("Must be between 8 and 128 characters")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Must contain at least one letter and one number")
    return value


def month_bounds(month):
    year, mon = (int(p) for p in month.split("-"))
    return date(year, mon, 1), date(year, mon, calendar.monthrange(year, mon)[1])


def current_month():
    return date.today().strftime("%Y-%m")


def previous_month(month):
    year, mon = (int(p) for p in month.split("-"))
    return f"{year - 1}-12" if mon == 1 else f"{year}-{mon - 1:02d}"


def int_arg(name, default, minimum=1, maximum=None):
    raw = request.args.get(name)
    if raw in (None, ""):
        return default
    try:
        number = int(raw)
    except ValueError:
        raise ValidationError({name: "Must be an integer"})
    if number < minimum:
        raise ValidationError({name: f"Must be at least {minimum}"})
    return min(number, maximum) if maximum else number


def month_arg(name="month"):
    raw = request.args.get(name)
    if raw in (None, ""):
        return None
    try:
        return parse_month(raw)
    except ValueError as exc:
        raise ValidationError({name: str(exc)})
