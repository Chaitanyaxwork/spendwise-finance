# SpendWise Backend

REST API for the SpendWise personal finance app. Flask + SQLAlchemy + JWT. JSON only, no frontend.

## Local setup

Requires Python 3.13.

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                 # Windows: copy .env.example .env
python app.py
```

API runs at `http://localhost:5001`. Check: `curl http://localhost:5001/api/health`

SQLite (`instance/spendwise.db`) is used by default and tables are created automatically on startup.
Alternative run command: `flask --app app run --debug`

Run tests: `pytest`

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `APP_ENV` | `development` or `production` (production enforces real secrets and Postgres) | `development` |
| `SECRET_KEY`, `JWT_SECRET_KEY` | Secrets (required in production) | dev-only values |
| `DATABASE_URL` | SQLAlchemy URL; `postgres://` is auto-converted | `sqlite:///spendwise.db` |
| `CORS_ORIGINS` | Comma-separated frontend origins, or `*` | localhost on ports 3000, 5173, 5500, 8000 |
| `JWT_ACCESS_MINUTES` / `JWT_REFRESH_DAYS` | Token lifetimes | `60` / `30` |
| `MAX_UPLOAD_MB` / `MAX_IMPORT_ROWS` | CSV limits | `2` / `5000` |
| `AUTO_CREATE_TABLES` | Create tables at startup | `true` |

Generate secrets: `python -c "import secrets; print(secrets.token_urlsafe(48))"`

## Response format

```json
{ "success": true, "data": { } }
{ "success": true, "data": [ ], "pagination": { "page": 1, "per_page": 20, "total": 45, "pages": 3, "has_next": true, "has_prev": false } }
{ "success": false, "error": { "message": "Validation failed", "details": { "amount": "Must be greater than 0" } } }
```

Status codes: `200`, `201` created, `400` malformed request, `401` auth missing/invalid/expired/revoked,
`404` not found (including other users' records), `409` conflict, `413` upload too large, `422` validation failed, `500` server error.

## Authentication

Send `Authorization: Bearer <access_token>` on every request except register, login and health.

1. `POST /api/auth/register` or `/api/auth/login` returns `access_token` and `refresh_token`.
2. Store both on the client; send the access token with each request.
3. On a `401` "Token has expired", call `POST /api/auth/refresh` with `Authorization: Bearer <refresh_token>` to get a new access token. If that fails, send the user to login.
4. `POST /api/auth/logout` revokes the access token (and the refresh token if you send `{"refresh_token": "..."}` in the body).

## Endpoints

All endpoints except `/api/health`, register and login require a JWT. Data is always scoped to the logged-in user.

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Body: `name`, `email`, `password` (min 8 chars, letter + number) |
| POST | `/api/auth/login` | Body: `email`, `password` |
| POST | `/api/auth/refresh` | Refresh token in header; returns new access token |
| POST | `/api/auth/logout` | Revoke token(s) |
| GET | `/api/auth/me` | Current user |
| GET | `/api/transactions` | Query: `type`, `category`, `month=YYYY-MM`, `date_from`, `date_to`, `page`, `per_page` (max 100) |
| POST | `/api/transactions` | Body: `amount`, `type` (`income`/`expense`), `category`?, `description`?, `date`? (YYYY-MM-DD, default today) |
| GET / PUT / PATCH / DELETE | `/api/transactions/<id>` | Single transaction; update accepts partial bodies |
| GET | `/api/dashboard` | Query: `month`? (filters summary, categories, recent), `months`? (trend length, default 12) |
| GET | `/api/budgets` | Query: `month`? (default current). Returns spent, remaining, percentage used, status per budget + summary |
| POST | `/api/budgets` | Body: `category`, `monthly_limit` |
| PUT / PATCH / DELETE | `/api/budgets/<id>` | Update or delete |
| GET | `/api/goals` | List goals with progress |
| POST | `/api/goals` | Body: `name`, `target_amount`, `current_amount`?, `target_date`? |
| PUT / PATCH / DELETE | `/api/goals/<id>` | Update or delete |
| GET | `/api/insights` | Query: `month`? (default: current, else latest month with data) |
| GET | `/api/insights/recurring` | Detected weekly/monthly recurring expenses |
| GET | `/api/insights/unusual` | Unusually large expenses for the month |
| POST | `/api/simulator` | Body: `monthly_income`, `monthly_expenses`, `monthly_savings`, `years` (1-50), `annual_return_rate`? (percent, default 0) |
| POST | `/api/import/csv` | `multipart/form-data`: `file` (.csv), `skip_duplicates`? (default `true`) |

Notes:
- If `category` is omitted on a transaction, it is auto-categorized from the description (else `Uncategorized`). Categories are normalized to Title Case.
- Budget `status` is `ok`, `warning` (80%+) or `exceeded` (over 100%).
- Insights are rule-based: highest category, month-over-month change, savings rate, budget warnings, statistical outliers, recurring expenses (3+ occurrences at a steady weekly/monthly interval and similar amount).
- The simulator adds each month's savings at month end and compounds at `annual_return_rate / 12`. It always returns 1, 3 and 5 year projections plus monthly rows for `years`.
- Amounts are returned as plain numbers; the API is currency-agnostic.

## Phase 2: Advanced analytics

All endpoints are `GET`, JWT-protected, scoped to the logged-in user, use the standard response format, and return `200` with empty/`sufficient_data: false` results when there is not enough history. Everything is computed locally with pandas/numpy from your own transactions; no external services.

| Endpoint | Params | Returns |
|---|---|---|
| `/api/analytics/monthly` | `month=YYYY-MM` (default: current, else latest with data) | `current` vs `previous` month, `changes` (income/expenses/savings: `amount`, `percent`, `direction`), `summaries` for 3/6/12 months (totals, averages, savings rate, `complete`), 12-month `chart`, `is_partial` |
| `/api/analytics/trends` | `months=3..24` (default 6) | `monthly` spending, `average_monthly_spending`, `highest_spending_month`, `lowest_spending_month`, `spending_trend`, `category_trends` (with per-month series), `increasing_categories`, `decreasing_categories` |
| `/api/analytics/recurring` | `status=all\|active\|lapsed` | `recurring` items (frequency, interval, kind, fixed/variable amount, next expected date, status, `estimated_monthly_cost`, confidence) and `summary` (active monthly/yearly total) |
| `/api/analytics/anomalies` | `months=1..36` (default 12), `month=YYYY-MM`, `limit=1..100` | `anomalies` (transaction, category, amount, `expected_range`, `reason`, `severity`, baseline) and `summary` |
| `/api/analytics/forecast` | none | `projection` (monthly income, expenses, savings, cumulative cash flow, ranges), `horizons` for 3/6/12 months with `available` flags, `methods`, `assumptions`, `warnings` |
| `/api/analytics/health` | `month=YYYY-MM`, `months=1..12` (default 3) | `metrics`: savings rate, expense-to-income ratio, budget utilization, recurring expense ratio, savings consistency, emergency fund. Raw metrics only, no combined score |
| `/api/analytics/report` | `month=YYYY-MM`, `format=json\|pdf` | Monthly summary, category breakdown (with change vs previous month), budget performance, active recurring expenses, key insights |

Methods:
- **Partial months**: trends and forecasts use completed months only. Monthly, health and report include the in-progress month when asked and flag it with `is_partial`.
- **Percent change**: `(new - old) / |old|`; `null` when the old value is 0.
- **Category direction**: average of the recent half vs the earlier half of the window (needs 4+ months). "Increasing"/"decreasing" needs a change of at least 10% and at least 1% of average monthly spending; otherwise "stable".
- **Recurring**: same normalized description (digits, months and words like "payment" ignored), similar amounts, and a steady interval: weekly, biweekly, monthly, quarterly (3+ occurrences) or yearly (2+). Weekly/biweekly need near-identical amounts (within 5%); others allow 15%. Items are `lapsed` if no charge appeared for 1.5 intervals, and lapsed items are excluded from monthly totals.
- **Anomalies**: Tukey fences on your own history. An expense is flagged if it exceeds Q3 + 1.5 x IQR for its category (or all expenses when a category has fewer than 6 transactions; needs 10 expenses overall) and is at least 1.5x the median. `severity` is `high` beyond Q3 + 3 x IQR. `expected_range.high` is that upper fence.
- **Forecast**: needs 3, 6 and 12 completed months for the 3, 6 and 12 month horizons. With under 6 months of history, or when a trend fits poorly, the projection is the historical monthly average. With 6+ months, a linear trend is used only if R-squared is at least 0.5, capped at +/-50% of the average. `range` is +/-1 standard deviation. Savings equals income minus expenses (net cash flow); `cumulative_cash_flow` is the running total.
- **Health**: savings consistency = share of the last 12 completed months with positive savings, plus the standard deviation of monthly savings rate. Emergency fund uses savings goals whose name contains "emergency", compared with average monthly expenses. Guideline values (20% savings rate, 3 to 6 months of expenses) are returned as reference numbers only.
- `/api/insights/recurring` and `/api/insights/unusual` now use the improved detectors and keep their Phase 1 fields.

Optional PDF: `GET /api/analytics/report?format=pdf` needs the free local library reportlab (`pip install -r requirements-pdf.txt`). Without it the endpoint returns `501` and everything else works. Add `-r requirements-pdf.txt` to your Render build command only if you want PDF export.

## CSV import format

Required columns: `date`, `amount`. Optional: `type`, `description`, `category`.
Header names are case-insensitive; aliases such as `transaction_date`, `value`, `memo`, `narration` are accepted.

```csv
date,amount,type,description,category
2026-09-01,85000,income,Monthly salary,Salary
2026-09-02,1200,expense,Swiggy dinner,
2026-09-03,-450.50,,Uber ride to airport,
2026-09-05,(75.00),,Pharmacy,
```

- `type` may be `income`/`expense` (also `credit`/`debit`, `deposit`/`withdrawal`). If missing or blank, negative amounts (`-50` or `(50)`) are expenses and positive amounts are income.
- Dates: `YYYY-MM-DD` preferred; `DD/MM/YYYY`, `DD-MM-YYYY`, `MM/DD/YYYY` (only when the day is over 12) and `DD Mon YYYY` are also accepted. Ambiguous dates like `03/04/2026` are read as day/month.
- Currency symbols and thousands separators in amounts are ignored.
- Blank categories are auto-categorized from the description.
- Invalid rows are skipped and reported by line number; valid rows are still imported. Rows identical to existing transactions (same date, amount, type, description) are skipped unless `skip_duplicates=false`.

```bash
curl -X POST http://localhost:5001/api/import/csv \
  -H "Authorization: Bearer $TOKEN" -F "file=@transactions.csv"
```

Response:

```json
{ "success": true,
  "data": { "summary": { "total_rows": 4, "imported": 4, "invalid_rows": 0, "duplicates_skipped": 0, "auto_categorized": 3, "uncategorized": 0 },
            "errors": [], "errors_truncated": false } }
```

## Deploy to Render

1. Push this folder to a Git repo (if `backend/` is a subfolder of the repo, set `rootDir: backend` in `render.yaml` or use the dashboard's Root Directory).
2. In Render: **New > Blueprint**, select the repo. `render.yaml` provisions a web service and a PostgreSQL database, generates `SECRET_KEY` and `JWT_SECRET_KEY`, and wires `DATABASE_URL`.
3. Set `CORS_ORIGINS` to your frontend URL(s), e.g. `https://spendwise.example.com`.
4. Deploy. Health check: `/api/health`.

Manual setup instead: Build `pip install -r requirements.txt`, Start `gunicorn --preload --workers 2 --bind 0.0.0.0:$PORT "app:create_app()"`, and set `APP_ENV=production`, `SECRET_KEY`, `JWT_SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGINS`, `PYTHON_VERSION=3.13.5`.

Render's default Python is newer than 3.13, so keep `PYTHON_VERSION` pinned. Tables are created at startup; for later schema changes, add Flask-Migrate.

## Structure

```
backend/
├── app.py            app factory, error handlers, JWT callbacks
├── config.py         env-based config
├── extensions.py     db, jwt, cors
├── models/           User, Transaction, Budget, SavingsGoal, TokenBlocklist
├── routes/           one blueprint per feature
├── services/         business logic (analytics, insights, csv_import, forecast, recurring, ...)
├── utils/            validators, response helpers
└── tests/            auth, transactions and analytics tests
```
