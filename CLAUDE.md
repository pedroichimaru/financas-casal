# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
pip3 install -r requirements.txt
uvicorn main:app --reload --port 8000
```

App runs at `http://localhost:8000`. The `--reload` flag hot-reloads on any Python file change; frontend changes (static/) take effect immediately on browser refresh.

The SQLite database (`financas.db`) is created automatically on first startup via `init_db()` called in the FastAPI lifespan.

## Architecture

Single-file FastAPI backend serving a vanilla HTML/CSS/JS frontend. No JS framework, no ORM.

```
main.py        FastAPI app + all endpoints + Pydantic models
parser.py      Reads XLSX bytes → list[dict] using openpyxl
classifier.py  Pure function: classify(despesa, id_origem, portador) → "Pedro"|"Marina"|"Casa"|"50/50"
database.py    SQLite via sqlite3 stdlib — init_db(), save_expenses(), get_meses(), get_expenses_by_mes()
static/        index.html + style.css + app.js (no build step)
financas.db    SQLite file, gitignored
```

### API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Serves index.html |
| POST | `/upload` | Parse XLSX (no save) → preview JSON |
| POST | `/import` | Classify + save to DB (replaces month if exists) |
| GET | `/meses` | List imported months ordered by date desc |
| GET | `/fechamento?mes=...` | Expenses + totais by conta for a month |

### Data flow

1. **Importar**: User picks month + XLSX → `/upload` parses and previews → user confirms → `/import` classifies each row via `classifier.py` and saves to SQLite.
2. **Fechamento**: Month picker calls `/meses` on tab open → selecting a month calls `/fechamento` → renders colored table with `tfoot` totals.

### Classification rules (classifier.py)

Priority order, first match wins:
1. "extrato" / "conta corrente" / "cc" in portador+id → **Casa**
2. "santander" + "master" → **Casa**
3. "santander" + "visa" → **Pedro** or **Marina** (detected from portador/id text)
4. "itaú" / "latam" → individual **except** iFood, Rappi, Estacionamento, Posto → **Casa**
5. Fallback → **50/50**

Person detection looks for "pedro" or "marina" (case-insensitive) anywhere in the combined `portador + id_origem` string.

### XLSX expected format

- Single sheet, header on row 1
- Columns (case-insensitive): `Data | Despesa | Valor (R$) | ID | Portador`
- Month reference (`mes`) is user-selected at import time, not derived from dates — parceled purchases may carry original purchase dates from prior months.

### Frontend sections

- **Importar**: month picker → drag-drop XLSX → preview table → "Importar despesas" saves to DB
- **Fechamento**: month dropdown (from `/meses`) → colored expense table + subtotals per conta + grand total

Row color palette (CSS variables in style.css): Pedro=emerald, Marina=pink, Casa=amber, 50/50=orange. Grand total always black bg / white text.
