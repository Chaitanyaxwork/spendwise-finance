from extensions import db
from utils.formatting import iso

from .mixins import TimestampMixin


class Budget(TimestampMixin, db.Model):
    __tablename__ = "budgets"
    __table_args__ = (
        db.UniqueConstraint("user_id", "category", name="uq_budgets_user_category"),
        db.CheckConstraint("monthly_limit > 0", name="ck_budgets_limit"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category = db.Column(db.String(50), nullable=False)
    monthly_limit = db.Column(db.Numeric(12, 2, asdecimal=False), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "category": self.category,
            "monthly_limit": round(float(self.monthly_limit), 2),
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }
