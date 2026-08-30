# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
pip3 install -r requirements.txt
JWT_SECRET=qualquer-coisa-para-dev uvicorn main:app --reload --port 8000
```

`JWT_SECRET` is **required** — `main.py` reads it with `os.environ["JWT_SECRET"]` and the app
refuses to start without it. In production it lives in `.env` on the server.

App runs at `http://localhost:8000`. The `--reload` flag hot-reloads on any Python file change; frontend changes (static/) take effect immediately on browser refresh.

The SQLite database (`financas.db`) is created automatically on first startup via `init_db()` called in the FastAPI lifespan. The DB path can be overridden via the `DB_PATH` environment variable.

## Architecture

Single-file FastAPI backend serving a vanilla HTML/CSS/JS frontend. No JS framework, no ORM.

```
main.py        FastAPI app + all endpoints + Pydantic models
parser.py      Reads XLSX bytes → list[dict] using openpyxl
classifier.py  classify(despesa, id_origem, portador, lookup) → "Pedro"|"Marina"|"Casa"|"50/50"
categorizer.py categorize(...) → expense nature ("Mercado", "Transporte/Uber", …)
database.py    SQLite via sqlite3 stdlib — all DB functions
static/        index.html + style.css + app.js (no build step)
financas.db    SQLite file, gitignored

Dockerfile     Production image (see Deployment)
docker-compose.yml
scripts/       backup.sh, deploy.sh, verify_db.py
.github/       Deploy workflow
render.yaml    Legacy Render config — kept only as a rollback path
```

### Database tables

| Table | Purpose |
|-------|---------|
| `despesas` | Imported expense rows (one per XLSX row) |
| `pagamentos` | Pedro's payments to Marina (registered manually per month) |
| `salarios` | Pedro + Marina monthly salaries (used for proportional Casa split) |
| `users` | Login accounts (email + bcrypt hash). Only 2 e-mails are allowed to register. |

All tables use a `mes_ordem` TEXT column (`YYYY-MM`) for correct chronological sorting.

### API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Serves index.html (the only unauthenticated route) |
| POST | `/auth/register` | Create account — **403 unless the e-mail is in `ALLOWED_EMAILS`** |
| POST | `/auth/login` | Returns a 30-day JWT — rate limited to 10/minute per IP |
| GET | `/auth/me` | Current user's e-mail |
| POST | `/auth/change-password` | Change password (requires the current one) |
| GET | `/dashboard` | Aggregated data for the Início section |
| POST | `/upload` | Parse XLSX (no save) → preview JSON |
| POST | `/import` | Classify + save to DB — **blocks with 409 if month already exists** |
| GET | `/meses` | List imported months ordered by date desc |
| GET | `/fechamento?mes=...` | Expenses + totais by apropriação for a month |
| PATCH | `/expenses/{id}/apropriacao` | Reclassify a single expense |
| PATCH | `/expenses/{id}/categoria` | Recategorize a single expense |
| DELETE | `/expenses/{id}` | Delete a single expense row |
| DELETE | `/despesas?mes=...` | Delete all expenses for a month (Zerar Mês) |
| GET | `/salarios` | List all salary records oldest → newest |
| GET | `/salarios/proporcao?mes=...` | Rolling 12-month avg split (pct_pedro / pct_marina) for a month |
| POST | `/salarios` | Upsert salary for a month |
| DELETE | `/salarios?mes=...` | Delete salary record for a month |
| GET | `/pagamentos?mes=...` | List payments for a month |
| POST | `/pagamentos` | Add a payment |
| PATCH | `/pagamentos/{id}` | Edit a payment |
| DELETE | `/pagamentos/{id}` | Delete a payment |
| DELETE | `/pagamentos?mes=...` | Delete all payments for a month (called alongside DELETE /despesas on Zerar Mês) |

### Data flow

1. **Importar**: User picks month + XLSX → frontend checks `/meses` first and blocks if month already imported → `/upload` parses and previews → user confirms → `/import` classifies each row and saves to SQLite.
2. **Fechamento**: On tab open, calls `/meses` → user selects month (or auto-loads most recent) → calls `/fechamento`, `/salarios/proporcao`, and `/pagamentos` in parallel → renders expense table + summary cards + balanço section.
3. **Dashboard**: Calls `/dashboard` which aggregates the most recent month's totals, salary split, and a full historical array for the Chart.js line chart.

### Authentication

All endpoints except `GET /` require a bearer token — every route declares
`_: str = Depends(get_current_user)`. JWT is HS256, valid for 30 days, signed with `JWT_SECRET`.

- Registration is closed: `ALLOWED_EMAILS` in `main.py` hardcodes the only two e-mails allowed.
- Passwords are bcrypt-hashed and stored in the `users` table (never in env or code).
- `POST /auth/login` is rate limited to 10/minute per IP via slowapi.
- The frontend keeps the token in `localStorage` and sends it through `authFetch()`
  (`static/app.js`), which clears it and shows the login overlay on any 401.

**Changing `JWT_SECRET` invalidates every stored token**, forcing both users to log in again.
That is the only consequence — passwords live in the DB and are unaffected.

### Classification rules (classifier.py)

Priority order, first match wins:

1. **Historical lookup** — if the same `(despesa, id_origem, portador)` tuple has been classified the same way ≥75% of the time across all stored months, uses that classification. Built by `build_classification_lookup()` from the `despesas` table.
2. "extrato" / "conta corrente" / "cc" in portador+id → **Casa**
3. "santander" + "master" → **Casa**
4. "santander" + "visa" → person detected from portador/id
5. "itaú" / "latam" → individual, **except** iFood, Rappi, Estacionamento, Posto/Combustível → **Casa**
6. Fallback → person detected from portador/id, or **50/50** if no person found

Person detection looks for "pedro" or "marina" (case-insensitive) anywhere in the combined `portador + id_origem` string.

### Categorization rules (categorizer.py)

Independent from apropriação: apropriação answers *who pays*, categoria answers *what it was*.
Same two-step shape as the classifier:

1. **Historical lookup** — same `(despesa, id_origem, portador)` tuple categorized the same way
   ≥75% of the time, via `build_categoria_lookup()`.
2. **Regex on the normalized name** (accents stripped, lowercased) against `_CATEGORIES`,
   in list order — first match wins, so the list order is significant.
3. Fallback → **"Falta classificar"**.

Rows imported before this feature existed have `categoria = NULL`, which the frontend renders
alongside "Falta classificar". Adding a keyword to `_CATEGORIES` only affects *future* imports
and rows whose category is later corrected by hand — it never rewrites stored rows.

### Salary proportions

`/salarios/proporcao?mes=...` returns the rolling 12-month average of Pedro/Marina salaries up to and including the given month. This proportion is used to split "Casa" expenses between Pedro and Marina in Fechamento summary cards and in the Dashboard. Falls back to 50/50 if no salary data exists.

### XLSX expected format

- Single sheet, header on row 1
- Columns (case-insensitive): `Data | Despesa | Valor (R$) | ID | Portador`
- Month reference (`mes`) is user-selected at import time, not derived from dates — parceled purchases may carry original purchase dates from prior months.

### Frontend sections

**Início (Dashboard)**
- Shows the most recent imported month: total geral, Pedro/Marina split, saldo em aberto (Marina's due minus Pedro's payments).
- Salary split cards (rolling average).
- Chart.js line chart with Total Geral / Pedro / Marina historical series, with period filter buttons (12m / 24m / 36m / Todos).
- Saldo card changes color: neutral (zerado), danger (em aberto), success (sobrepago).

**Login**
- Full-screen overlay (`#auth-overlay`) shown whenever there is no valid token, and re-shown
  by `authFetch()` on any 401. Everything else stays mounted behind it.

**Importar**
- Month picker (month + year dropdowns) → drag-drop or click XLSX → frontend pre-checks `/meses` and blocks reimport with an error message if month already exists → preview table → "Importar despesas" button calls `/import`.

**Fechamento**
- Month navigator (← prev / label dropdown / next →) with auto-load of most recent month.
- Expense table with: column filters (ID, Portador, Apropriação), sortable columns, row color by apropriação.
- Each row has: inline Apropriação dropdown for reclassification (PATCH to backend), and a delete (×) button.
- **Summary cards**: Pedro / Marina / Casa / 50/50 subtotals + Total Geral card. Casa card shows salary-proportion split; Total Geral card shows final Pedro/Marina totals.
- **ID Totals strip**: horizontal bar below summary showing total per card/account, sorted CC first then alpha.
- **Categoria chart**: horizontal bar chart of totals per categoria, with a Total/Pedro/Marina
  selector. "Falta classificar" is always pinned last regardless of value.
- **Balanço section**: table of Pedro's payments to Marina for the month. Each payment has an `apropriacao` (Pedro / 50/50 / Casa) that determines its abatimento value. Shows total Marina due, total abatido, and saldo residual.
- **Zerar Mês**: deletes all despesas and pagamentos for the month. Requires typing the phrase **"ZERAR MÊS"** in a confirmation modal before executing.

**Salários**
- Form to add/edit monthly Pedro + Marina salaries (upsert).
- Table showing each month's raw salaries, rolling 12-month averages, and resulting % split.
- Summary cards at top showing the current rolling average split.

### Confirm modal

`showConfirmModal(title, desc, onConfirm, phrase = null)` — generic modal used for all destructive actions. When `phrase` is provided (e.g. `"ZERAR MÊS"`), the OK button is disabled until the user types the exact phrase. Used for: Zerar Mês (phrase required), delete single expense (no phrase), delete/edit payment (no phrase), delete salary (no phrase).

### Row color palette

CSS variables in `style.css`: Pedro=emerald, Marina=pink, Casa=amber, 50/50=orange.

## Deployment

Production runs at **https://financas-casal.pdic.dev** on a shared Hetzner server
(migrated off Render in August 2026). No application code is environment-specific.

### How it is wired

```
Cloudflare DNS (A record, "DNS only" — never proxied)
        ↓
Caddy container in /srv/edge  — terminates TLS for every project on the box
        ↓  (docker network "financas")
container "financas" — uvicorn, 1 worker, non-root, no published port
        ↓
/srv/financas/data/financas.db  (bind mount)
```

The app is **never exposed directly**: it has `expose: 8000` and no `ports:`, so the only way
in is through Caddy. Each project on the server gets its own Docker network and they cannot
reach each other.

### Deploying

Push to `main`. `.github/workflows/deploy.yml` connects over SSH, runs `scripts/deploy.sh`
(`git reset --hard origin/main` + `docker compose up -d --build`) and fails the run unless the
public URL answers 200 afterwards. The deploy key is locked to a forced command server-side —
it can run that script and nothing else.

### Two things that will bite you

**`--proxy-headers` is load-bearing.** It is in the Dockerfile's `CMD`. Behind Caddy, without
it, `get_remote_address` sees the proxy's IP for every request and the 10/minute login rate
limit silently becomes global instead of per-user.

**The repo is public.** `.gitignore` covers `*.csv`, `*.xlsx`, `*.db`, `data/` and `backups/`.
Never commit statements, database files, or `.env`.

### Data

The SQLite file is the single source of truth. `scripts/backup.sh` runs nightly at 03:40 via
cron on the host: SQLite `.backup` (not `cp`), `PRAGMA integrity_check`, gzip, 30-day retention
into `/srv/backups/financas/`. Backups are **local to the server only** — there is no off-site
copy, so losing the server loses the history.

`scripts/verify_db.py <file.db>` prints row counts, sums, per-month totals and an integrity
check. Run it on two databases and `diff` the output to prove a copy or restore lost nothing.
