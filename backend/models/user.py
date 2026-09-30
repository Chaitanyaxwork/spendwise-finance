from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db
from utils.formatting import iso

from .mixins import TimestampMixin


class User(TimestampMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)

    transactions = db.relationship("Transaction", cascade="all, delete-orphan", lazy="dynamic")
    budgets = db.relationship("Budget", cascade="all, delete-orphan", lazy="dynamic")
    goals = db.relationship("SavingsGoal", cascade="all, delete-orphan", lazy="dynamic")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "created_at": iso(self.created_at),
        }
