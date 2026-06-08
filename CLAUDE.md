# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
pip3 install -r requirements.txt
uvicorn main:app --reload --port 8000
```

App runs at `http://localhost:8000`. The `--reload` flag hot-reloads on any Python file change; frontend changes (static/) take effect immediately on browser refresh.

The SQLite database (`financas.db`) is created automatically on first startup via `init_db()` called in the FastAPI lifespan. The DB path can be overridden via the `DB_PATH` environment variable.

## Architecture

Single-file FastAPI backend serving a vanilla HTML/CSS/JS frontend. No JS framework, no ORM.

```
main.py        FastAPI app + all endpoints + Pydantic models
parser.py      Reads XLSX bytes → list[dict] using openpyxl
classifier.py  classify(despesa, id_origem, portador, lookup) → "Pedro"|"Marina"|"Casa"|"50/50"
database.py    SQLite via sqlite3 stdlib — all DB functions
static/        index.html + style.css + app.js (no build step)
financas.db    SQLite file, gitignored
```

### Database tables

| Table | Purpose |
|-------|---------|
| `despesas` | Imported expense rows (one per XLSX row) |
| `pagamentos` | Pedro's payments to Marina (registered manually per month) |
| `salarios` | Pedro + Marina monthly salaries (used for proportional Casa split) |

All tables use a `mes_ordem` TEXT column (`YYYY-MM`) for correct chronological sorting.

### API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Serves index.html |
| GET | `/dashboard` | Aggregated data for the Início section |
| POST | `/upload` | Parse XLSX (no save) → preview JSON |
| POST | `/import` | Classify + save to DB — **blocks with 409 if month already exists** |
| GET | `/meses` | List imported months ordered by date desc |
| GET | `/fechamento?mes=...` | Expenses + totais by apropriação for a month |
| PATCH | `/expenses/{id}/apropriacao` | Reclassify a single expense |
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

### Classification rules (classifier.py)

Priority order, first match wins:

1. **Historical lookup** — if the same `(despesa, id_origem, portador)` tuple has been classified the same way ≥75% of the time across all stored months, uses that classification. Built by `build_classification_lookup()` from the `despesas` table.
2. "extrato" / "conta corrente" / "cc" in portador+id → **Casa**
3. "santander" + "master" → **Casa**
4. "santander" + "visa" → person detected from portador/id
5. "itaú" / "latam" → individual, **except** iFood, Rappi, Estacionamento, Posto/Combustível → **Casa**
6. Fallback → person detected from portador/id, or **50/50** if no person found

Person detection looks for "pedro" or "marina" (case-insensitive) anywhere in the combined `portador + id_origem` string.

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

**Importar**
- Month picker (month + year dropdowns) → drag-drop or click XLSX → frontend pre-checks `/meses` and blocks reimport with an error message if month already exists → preview table → "Importar despesas" button calls `/import`.

**Fechamento**
- Month navigator (← prev / label dropdown / next →) with auto-load of most recent month.
- Expense table with: column filters (ID, Portador, Apropriação), sortable columns, row color by apropriação.
- Each row has: inline Apropriação dropdown for reclassification (PATCH to backend), and a delete (×) button.
- **Summary cards**: Pedro / Marina / Casa / 50/50 subtotals + Total Geral card. Casa card shows salary-proportion split; Total Geral card shows final Pedro/Marina totals.
- **ID Totals strip**: horizontal bar below summary showing total per card/account, sorted CC first then alpha.
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
