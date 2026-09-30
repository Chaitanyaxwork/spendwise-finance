import io
import re

import pandas as pd

from extensions import db
from models import Transaction
from services.categorizer import categorize
from utils.validators import ValidationError, normalize_category, parse_amount, parse_date

UNCATEGORIZED = "Uncategorized"
MAX_ERRORS = 100

ALIASES = {
    "date": {"date", "transaction_date", "posted_date", "txn_date", "value_date"},
    "amount": {"amount", "value", "transaction_amount"},
    "type": {"type", "transaction_type", "txn_type"},
    "description": {"description", "memo", "details", "narration", "note", "notes", "payee", "merchant", "name"},
    "category": {"category"},
}
INCOME_WORDS = {"income", "credit", "deposit", "cr", "inflow"}
EXPENSE_WORDS = {"expense", "debit", "withdrawal", "dr", "outflow", "payment"}
AMOUNT_RE = re.compile(r"\(?-?(?:\d+(?:\.\d*)?|\.\d+)\)?")


def _header(name):
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def _map_columns(columns):
    mapping = {}
    for col in columns:
        norm = _header(col)
        for canonical, names in ALIASES.items():
            if norm in names and canonical not in mapping.values():
                mapping[col] = canonical
                break
    return mapping


def parse_signed_amount(raw):
    text = re.sub(r"[,\s$₹€£]", "", str(raw))
    if not text:
        raise ValueError("Amount is empty")
    if not AMOUNT_RE.fullmatch(text):
        raise ValueError(f"Invalid amount '{raw}'")
    negative = text.startswith("-") or text.startswith("(")
    return parse_amount(text.strip("()-")), negative


def _resolve_type(raw_type, negative):
    if raw_type:
        word = raw_type.strip().lower()
        if word in INCOME_WORDS:
            return "income"
        if word in EXPENSE_WORDS:
            return "expense"
        raise ValueError(f"Unknown type '{raw_type}'")
    return "expense" if negative else "income"


def _read(text):
    try:
        df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False, skipinitialspace=True)
    except (pd.errors.EmptyDataError, pd.errors.ParserError) as exc:
        raise ValidationError({"file": f"Could not parse CSV: {exc}"})
    mapping = _map_columns(df.columns)
    missing = [c for c in ("date", "amount") if c not in mapping.values()]
    if missing:
        raise ValidationError({
            "columns": f"Missing required column(s): {', '.join(missing)}",
            "found": [str(c) for c in df.columns],
        })
    return df.rename(columns=mapping)[list(mapping.values())]


def import_csv(user_id, text, max_rows, skip_duplicates=True):
    df = _read(text)
    if df.empty:
        raise ValidationError({"file": "CSV contains no data rows"})
    if len(df) > max_rows:
        raise ValidationError({"file": f"CSV has {len(df)} rows; the limit is {max_rows}"})

    parsed, errors = [], []
    auto_categorized = 0
    for idx, row in df.iterrows():
        line = int(idx) + 2
        try:
            tx_date = parse_date(row["date"], lenient=True)
            amount, negative = parse_signed_amount(row["amount"])
            tx_type = _resolve_type(row["type"] if "type" in df.columns else "", negative)
        except ValueError as exc:
            errors.append({"row": line, "error": str(exc)})
            continue
        description = " ".join(str(row["description"]).split())[:255] if "description" in df.columns else ""
        category = ""
        if "category" in df.columns:
            category = " ".join(str(row["category"]).split())[:50]
        if category:
            category = normalize_category(category)
        else:
            guessed = categorize(description, tx_type)
            if guessed:
                auto_categorized += 1
            category = guessed or UNCATEGORIZED
        parsed.append({
            "user_id": user_id, "date": tx_date, "amount": amount, "type": tx_type,
            "category": category, "description": description,
        })

    duplicates = 0
    if skip_duplicates and parsed:
        low = min(p["date"] for p in parsed)
        high = max(p["date"] for p in parsed)
        existing = {
            (t.date, round(float(t.amount), 2), t.type, (t.description or "").strip().lower())
            for t in db.session.query(Transaction.date, Transaction.amount, Transaction.type, Transaction.description)
            .filter(Transaction.user_id == user_id, Transaction.date >= low, Transaction.date <= high)
        }
        kept = []
        for p in parsed:
            if (p["date"], p["amount"], p["type"], p["description"].lower()) in existing:
                duplicates += 1
            else:
                kept.append(p)
        parsed = kept

    if parsed:
        db.session.add_all([Transaction(**p) for p in parsed])
        db.session.commit()

    uncategorized = sum(1 for p in parsed if p["category"] == UNCATEGORIZED)
    return {
        "summary": {
            "total_rows": int(len(df)),
            "imported": len(parsed),
            "invalid_rows": len(errors),
            "duplicates_skipped": duplicates,
            "auto_categorized": auto_categorized,
            "uncategorized": uncategorized,
        },
        "errors": errors[:MAX_ERRORS],
        "errors_truncated": len(errors) > MAX_ERRORS,
    }
