MILESTONES = (1, 3, 5)


def simulate(monthly_income, monthly_expenses, monthly_savings, years, annual_return_rate=0.0):
    monthly_rate = annual_return_rate / 100 / 12
    horizon_years = max(years, max(MILESTONES))
    balance = 0.0
    contributed = 0.0
    rows = []
    for month in range(1, horizon_years * 12 + 1):
        balance = balance * (1 + monthly_rate) + monthly_savings
        contributed += monthly_savings
        rows.append({
            "month": month,
            "year": (month - 1) // 12 + 1,
            "contribution": round(monthly_savings, 2),
            "total_contributed": round(contributed, 2),
            "interest_earned": round(balance - contributed, 2),
            "balance": round(balance, 2),
        })

    def milestone(y):
        row = rows[y * 12 - 1]
        return {
            "years": y,
            "projected_savings": row["balance"],
            "total_contributed": row["total_contributed"],
            "interest_earned": row["interest_earned"],
        }

    surplus = round(monthly_income - monthly_expenses, 2)
    unallocated = round(surplus - monthly_savings, 2)
    warnings = []
    if unallocated < 0:
        warnings.append(
            f"Planned monthly savings exceed your surplus (income - expenses) by {abs(unallocated):,.2f}."
        )
    if monthly_income and monthly_expenses > monthly_income:
        warnings.append("Monthly expenses exceed monthly income.")

    return {
        "inputs": {
            "monthly_income": monthly_income,
            "monthly_expenses": monthly_expenses,
            "monthly_savings": monthly_savings,
            "years": years,
            "annual_return_rate": annual_return_rate,
        },
        "monthly_surplus": surplus,
        "unallocated_after_savings": unallocated,
        "savings_rate": round(monthly_savings / monthly_income * 100, 2) if monthly_income else 0.0,
        "warnings": warnings,
        "projections": [milestone(y) for y in MILESTONES],
        "selected_period": milestone(years),
        "monthly_projection": rows[: years * 12],
    }
