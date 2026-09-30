from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from extensions import db
from models import Transaction
from services import transactions as service
from utils.auth import current_user_id
from utils.responses import error, success
from utils.validators import int_arg, json_body

bp = Blueprint("transactions", __name__, url_prefix="/api/transactions")


def _get_owned(transaction_id):
    return Transaction.query.filter_by(id=transaction_id, user_id=current_user_id()).first()


@bp.get("")
@jwt_required()
def list_transactions():
    stmt = service.filtered_select(current_user_id(), request.args)
    page = int_arg("page", 1)
    per_page = int_arg("per_page", 20, maximum=100)
    result = db.paginate(stmt, page=page, per_page=per_page, error_out=False)
    return success(
        [t.to_dict() for t in result.items],
        pagination={
            "page": result.page,
            "per_page": result.per_page,
            "total": result.total,
            "pages": result.pages,
            "has_next": result.has_next,
            "has_prev": result.has_prev,
        },
    )


@bp.post("")
@jwt_required()
def create_transaction():
    tx = service.create_transaction(current_user_id(), json_body())
    return success(tx.to_dict(), 201)


@bp.get("/<int:transaction_id>")
@jwt_required()
def get_transaction(transaction_id):
    tx = _get_owned(transaction_id)
    if not tx:
        return error("Transaction not found", 404)
    return success(tx.to_dict())


@bp.route("/<int:transaction_id>", methods=["PUT", "PATCH"])
@jwt_required()
def update_transaction(transaction_id):
    tx = _get_owned(transaction_id)
    if not tx:
        return error("Transaction not found", 404)
    return success(service.update_transaction(tx, json_body()).to_dict())


@bp.delete("/<int:transaction_id>")
@jwt_required()
def delete_transaction(transaction_id):
    tx = _get_owned(transaction_id)
    if not tx:
        return error("Transaction not found", 404)
    db.session.delete(tx)
    db.session.commit()
    return success({"message": "Transaction deleted"})
