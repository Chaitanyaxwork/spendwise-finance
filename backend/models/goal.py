from datetime import date

from extensions import db
from utils.formatting import iso

from .mixins import TimestampMixin


class SavingsGoal(TimestampMixin, db.Model):
    __tablename__ = "savings_goals"
    __table_args__ = (
        db.CheckConstraint("target_amount > 0", name="ck_goals_target"),
        db.CheckConstraint("current_amount >= 0", name="ck_goals_current"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    target_amount = db.Column(db.Numeric(12, 2, asdecimal=False), nullable=False)
    current_amount = db.Column(db.Numeric(12, 2, asdecimal=False), nullable=False, default=0)
    target_date = db.Column(db.Date, nullable=True)

    def to_dict(self):
        target = float(self.target_amount)
        current = float(self.current_amount or 0)
        return {
            "id": self.id,
            "name": self.name,
            "target_amount": round(target, 2),
            "current_amount": round(current, 2),
            "target_date": self.target_date.isoformat() if self.target_date else None,
            "progress_percentage": round(min(current / target * 100, 100), 2) if target else 0.0,
            "remaining_amount": round(max(target - current, 0), 2),
            "is_completed": current >= target,
            "days_remaining": (self.target_date - date.today()).days if self.target_date else None,
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }
