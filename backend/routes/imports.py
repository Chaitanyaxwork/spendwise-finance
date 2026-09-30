from flask import Blueprint, current_app, request
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from services.csv_import import import_csv
from utils.auth import current_user_id
from utils.responses import error, success

bp = Blueprint("imports", __name__, url_prefix="/api/import")


@bp.post("/csv")
@jwt_required()
def import_transactions_csv():
    file = request.files.get("file")
    if not file or not file.filename:
        return error("No file uploaded; send a CSV as multipart/form-data in the 'file' field", 400)
    if not file.filename.lower().endswith(".csv"):
        return error("Only .csv files are supported", 422)

    raw = file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    skip_duplicates = request.form.get("skip_duplicates", "true").strip().lower() not in ("false", "0", "no")
    try:
        result = import_csv(
            current_user_id(), text, current_app.config["MAX_IMPORT_ROWS"], skip_duplicates
        )
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("CSV import failed")
        return error("Import failed due to a database error", 500)

    if result["summary"]["imported"] == 0 and result["errors"]:
        return error("No valid rows to import", 422, details=result)
    return success(result, 201 if result["summary"]["imported"] else 200)
