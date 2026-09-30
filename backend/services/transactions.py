from datetime import date

from extensions import db
from models import Transaction
from services.categorizer import categorize
from utils.validators import (
    TRANSACTION_TYPES, ValidationError, Validator, clean_str, month_bounds,
    normalize_category, parse_amount, parse_date, parse_month, parse_type,
)

UNCATEGORIZED = "Uncategorized"


def validate_payload(data, partial=False):
    v = Validator()
    out = {}
    if not partial or "amount" in data:
        out["amount"] = v.run("amount", parse_amount, data.get("amount"))
    if not partial or "type" in data:
        out["type"] = v.run("type", parse_type, data.get("type"))
    if not partial or "description" in data:
        out["description"] = v.run("description", clean_str, data.get("description"), 255) or ""
    if "category" in data:
        category = v.run("category", clean_str, data.get("category"), 50)
        out["category"] = normalize_category(category) if category else None
    if not partial or "date" in data:
        raw = data.get("date")
        if raw in (None, "") and not partial:
            out["date"] = date.today()
        else:
            out["date"] = v.run("date", parse_date, raw)
    v.check()
    return out


def create_transaction(user_id, data):
    fields = validate_payload(data)
    category = fields.get("category") or categorize(fields["description"], fields["type"]) or UNCATEGORIZED
    fields["category"] = category
    tx = Transaction(user_id=user_id, **fields)
    db.session.add(tx)
    db.session.commit()
    return tx


def update_transaction(tx, data):
    fields = validate_payload(data, partial=True)
    category_given = "category" in fields
    category = fields.pop("category", None)
    for key, value in fields.items():
        setattr(tx, key, value)
    if category_given:
        tx.category = category or categorize(tx.description, tx.type) or UNCATEGORIZED
    db.session.commit()
    return tx


def filtered_select(user_id, args):
    stmt = db.select(Transaction).where(Transaction.user_id == user_id)
    v = Validator()

    tx_type = args.get("type")
    if tx_type:
        tx_type = v.run("type", parse_type, tx_type)
        if tx_type:
            stmt = stmt.where(Transaction.type == tx_type)

    category = args.get("category")
    if category and category.strip():
        stmt = stmt.where(Transaction.category == normalize_category(category.strip()))

    month = args.get("month")
    if month:
        month = v.run("month", parse_month, month)
        if month:
            start, end = month_bounds(month)
            stmt = stmt.where(Transaction.date >= start, Transaction.date <= end)

    for name, op in (("date_from", "ge"), ("date_to", "le")):
        raw = args.get(name)
        if raw:
            parsed = v.run(name, parse_date, raw)
            if parsed:
                stmt = stmt.where(
                    Transaction.date >= parsed if op == "ge" else Transaction.date <= parsed
                )

    v.check()
    return stmt.order_by(Transaction.date.desc(), Transaction.id.desc())
