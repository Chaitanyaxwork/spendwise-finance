# SpendWise

Responsive personal-finance app: a vanilla HTML/CSS/JS frontend (`frontend/`, Chart.js, no build step) connected to the Flask REST API in `backend/`.

## Run the full stack locally

Terminal 1, backend (Python 3.13):

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # Windows: copy .env.example .env
python app.py                        # http://localhost:5001
```

Terminal 2, frontend (any static server; ES modules need http, not file://):

```bash
cd frontend
python3 -m http.server 8000          # open http://localhost:8000
```

Register a new account on the sign-up page (password: 8+ characters with a letter and a number). On `localhost` the frontend calls `http://localhost:5001` automatically. The backend allows the frontend origins `localhost` / `127.0.0.1` on ports 3000, 5173, 5500 and 8000; for another origin, add it to `CORS_ORIGINS` in `backend/.env`.

Tip: use **Transactions > Import CSV** with 6 to 12 months of history so Analytics (trends, forecast, recurring, health) has data to work with.

## Deploy

1. Deploy `backend/` to Render (see `backend/README.md`) and set `CORS_ORIGINS` to your frontend URL.
2. Set the environment variable `API_BASE_URL` on your frontend host to your Render service URL (origin only, for example `https://your-api.onrender.com`). The frontend host runs `node build-config.js` at build time, which writes `frontend/config.js` (git-ignored), so the address is never committed.
3. Host `frontend/` on a static host with root directory `frontend`, build command `node build-config.js`, and publish/output directory `.`:
   - **Vercel:** import the repo, set Root Directory to `frontend` (`vercel.json` supplies the build settings), and add `API_BASE_URL` under Settings > Environment Variables.
   - **Render Static Site:** Root Directory `frontend`, Build Command `node build-config.js`, Publish Directory `.`, plus an `API_BASE_URL` environment variable.
   If `API_BASE_URL` is missing, the build fails on purpose instead of silently falling back to demo mode.
4. Set `CORS_ORIGINS` on the API service to your frontend origin.

## How the frontend uses the API

All requests go through `frontend/js/api.js`, which sends `Authorization: Bearer <token>` (stored in `sessionStorage`), unwraps the `{ success, data }` envelope, and adapts the backend's snake_case responses to the shapes the page scripts use. Page scripts are unchanged.

| Page | Backend endpoints |
| --- | --- |
| Login / Register / Profile | `POST /api/auth/login`, `/register`, `GET /api/auth/me`, `POST /api/auth/logout` (revokes the token on sign-out) |
| Dashboard, Transactions | `GET/POST /api/transactions`, `PUT/DELETE /api/transactions/:id` (all pages are fetched, 100 per request), `GET /api/budgets`, `/api/goals` |
| CSV import | `POST /api/import/csv` (duplicates of existing transactions are skipped) |
| Budgets, Goals | `/api/budgets`, `/api/goals` (`limit` maps to `monthly_limit`; `current`/`target`/`targetDate` map to `current_amount`/`target_amount`/`target_date`) |
| Insights | `GET /api/insights` (messages become insight cards) |
| Analytics | `/api/analytics/monthly`, `/trends`, `/recurring` (active items), `/anomalies`, `/forecast`, `/health`, `/report` |

Behaviour to know:
- The Analytics monthly cards compare the latest **completed** month with the one before it; the in-progress month is left out so early-month figures do not look like a spending drop.
- Financial health shows the underlying metrics only (savings rate, expense-to-income, budget utilization, recurring ratio, savings consistency, emergency fund). The backend intentionally returns no combined score.
- The emergency-fund metric uses a savings goal whose name contains "emergency".
- The forecast rows show projected cumulative net cash flow per month and need at least 3 completed months of history.
- Sessions use the access token only and end after `JWT_ACCESS_MINUTES` (default 60); the user is then sent back to sign in.
- The savings scenario page still calculates locally and does not call `/api/simulator`.
- Leave `API_BASE_URL` empty (outside localhost) to run the browser-only demo. For local testing against a remote API, copy `frontend/config.example.js` to `frontend/config.js`.

## Demo behavior and privacy

Transactions, budgets, goals and CSV imports can be edited locally and are stored in `localStorage` for this browser. The demo identity/profile and demo session state are stored in `sessionStorage`; these browser facilities are **not** secure authentication or storage. Seeded records use INR-scale amounts. The demo may describe repeated transaction labels as observations, but it does not claim that they are verified subscriptions. It does not synthesize anomaly, forecast or financial-health scores.

The savings scenario uses the amounts and assumptions entered by the user. Without an optional return it assumes steady month-end contributions and no investment return; with a return it applies the selected annual rate compounded monthly. All projections are illustrative and not guaranteed.
