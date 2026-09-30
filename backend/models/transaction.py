from extensions import db
from utils.formatting import iso

from .mixins import TimestampMixin


class Transaction(TimestampMixin, db.Model):
    __tablename__ = "transactions"
    __table_args__ = (
        db.Index("ix_transactions_user_date", "user_id", "date"),
        db.Index("ix_transactions_user_type", "user_id", "type"),
        db.Index("ix_transactions_user_category", "user_id", "category"),
        db.CheckConstraint("type IN ('income', 'expense')", name="ck_transactions_type"),
        db.CheckConstraint("amount > 0", name="ck_transactions_amount"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount = db.Column(db.Numeric(12, 2, asdecimal=False), nullable=False)
    type = db.Column(db.String(10), nullable=False)
    category = db.Column(db.String(50), nullable=False, default="Uncategorized")
    description = db.Column(db.String(255), nullable=False, default="")
    date = db.Column(db.Date, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "amount": round(float(self.amount), 2),
            "type": self.type,
            "category": self.category,
            "description": self.description or "",
            "date": self.date.isoformat(),
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }
