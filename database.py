import os
import sqlite3
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent / "financas.db")))

_MONTH_NUM = {
    "janeiro": "01", "fevereiro": "02", "março": "03", "abril": "04",
    "maio": "05", "junho": "06", "julho": "07", "agosto": "08",
    "setembro": "09", "outubro": "10", "novembro": "11", "dezembro": "12",
}


def _mes_sort_key(mes: str) -> str:
    parts = mes.lower().split("/")
    if len(parts) == 2:
        num = _MONTH_NUM.get(parts[0].strip(), "00")
        return f"{parts[1].strip()}-{num}"
    return mes


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS despesas (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                mes         TEXT    NOT NULL,
                mes_ordem   TEXT    NOT NULL,
                data        TEXT,
                despesa     TEXT,
                valor       REAL,
                id_origem   TEXT,
                portador    TEXT,
                apropriacao TEXT,
                importado_em TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pagamentos (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                mes         TEXT NOT NULL,
                data        TEXT NOT NULL,
                pagamento   TEXT NOT NULL,
                valor       REAL NOT NULL,
                apropriacao TEXT NOT NULL DEFAULT 'Pedro'
            )
        """)
        # Migration: add apropriacao column to existing tables
        try:
            conn.execute("ALTER TABLE pagamentos ADD COLUMN apropriacao TEXT NOT NULL DEFAULT 'Pedro'")
        except Exception:
            pass
        conn.execute("""
            CREATE TABLE IF NOT EXISTS salarios (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                mes       TEXT NOT NULL UNIQUE,
                mes_ordem TEXT NOT NULL,
                pedro     REAL NOT NULL DEFAULT 0,
                marina    REAL NOT NULL DEFAULT 0
            )
        """)
        conn.commit()


def save_expenses(mes: str, expenses: list[dict]):
    ordem = _mes_sort_key(mes)
    with get_conn() as conn:
        conn.execute("DELETE FROM despesas WHERE mes = ?", (mes,))
        conn.executemany(
            """INSERT INTO despesas
               (mes, mes_ordem, data, despesa, valor, id_origem, portador, apropriacao)
               VALUES (?,?,?,?,?,?,?,?)""",
            [
                (mes, ordem, e["data"], e["despesa"], e["valor"],
                 e["id"], e["portador"], e["apropriacao"])
                for e in expenses
            ],
        )
        conn.commit()


def get_meses() -> list[str]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT mes FROM despesas ORDER BY mes_ordem DESC"
        ).fetchall()
        return [r["mes"] for r in rows]


def build_classification_lookup() -> dict:
    """Retorna {(despesa, id_origem, portador): {apropriacao: count}} do histórico."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT despesa, id_origem, portador, apropriacao, COUNT(*) AS freq
               FROM despesas
               GROUP BY despesa, id_origem, portador, apropriacao"""
        ).fetchall()
    lookup: dict = {}
    for row in rows:
        key = (
            (row["despesa"]   or "").strip().lower(),
            (row["id_origem"] or "").strip().lower(),
            (row["portador"]  or "").strip().lower(),
        )
        lookup.setdefault(key, {})[row["apropriacao"]] = row["freq"]
    return lookup


def get_expenses_by_mes(mes: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT id, data, despesa, valor, id_origem, portador, apropriacao
               FROM despesas WHERE mes = ? ORDER BY rowid""",
            (mes,),
        ).fetchall()
        return [dict(r) for r in rows]


def update_apropriacao(expense_id: int, apropriacao: str):
    with get_conn() as conn:
        conn.execute(
            "UPDATE despesas SET apropriacao = ? WHERE id = ?",
            (apropriacao, expense_id),
        )
        conn.commit()


def delete_expense(expense_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM despesas WHERE id = ?", (expense_id,))
        conn.commit()


def delete_mes(mes: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM despesas WHERE mes = ?", (mes,))
        conn.commit()


# ---------- Salários ----------

def get_salarios() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT mes, pedro, marina FROM salarios ORDER BY mes_ordem ASC"
        ).fetchall()
        return [dict(r) for r in rows]


def upsert_salario(mes: str, pedro: float, marina: float):
    ordem = _mes_sort_key(mes)
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO salarios (mes, mes_ordem, pedro, marina) VALUES (?, ?, ?, ?)
               ON CONFLICT(mes) DO UPDATE SET
                 mes_ordem = excluded.mes_ordem,
                 pedro     = excluded.pedro,
                 marina    = excluded.marina""",
            (mes, ordem, pedro, marina),
        )
        conn.commit()


def delete_salario(mes: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM salarios WHERE mes = ?", (mes,))
        conn.commit()


def get_pagamentos(mes: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, data, pagamento, valor, apropriacao FROM pagamentos WHERE mes = ? ORDER BY rowid",
            (mes,),
        ).fetchall()
        return [dict(r) for r in rows]


def add_pagamento(mes: str, data: str, pagamento: str, valor: float, apropriacao: str = "Pedro") -> dict:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO pagamentos (mes, data, pagamento, valor, apropriacao) VALUES (?, ?, ?, ?, ?)",
            (mes, data, pagamento, valor, apropriacao),
        )
        conn.commit()
        return {"id": cur.lastrowid, "mes": mes, "data": data, "pagamento": pagamento,
                "valor": valor, "apropriacao": apropriacao}


def update_pagamento(pag_id: int, data: str, pagamento: str, valor: float, apropriacao: str = "Pedro"):
    with get_conn() as conn:
        conn.execute(
            "UPDATE pagamentos SET data=?, pagamento=?, valor=?, apropriacao=? WHERE id=?",
            (data, pagamento, valor, apropriacao, pag_id),
        )
        conn.commit()


def delete_pagamento(pag_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM pagamentos WHERE id = ?", (pag_id,))
        conn.commit()


def delete_pagamentos_by_mes(mes: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM pagamentos WHERE mes = ?", (mes,))
        conn.commit()




def get_proporcao_for_mes(mes: str) -> dict:
    ordem_ref = _mes_sort_key(mes)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT mes_ordem, pedro, marina FROM salarios ORDER BY mes_ordem ASC"
        ).fetchall()
    eligible = [dict(r) for r in rows if r["mes_ordem"] <= ordem_ref]
    if not eligible:
        return {"found": False, "pct_pedro": 50.0, "pct_marina": 50.0, "window_size": 0}
    window     = eligible[-12:]
    avg_pedro  = sum(r["pedro"]  for r in window) / len(window)
    avg_marina = sum(r["marina"] for r in window) / len(window)
    total      = avg_pedro + avg_marina
    if total == 0:
        return {"found": True, "pct_pedro": 50.0, "pct_marina": 50.0, "window_size": len(window)}
    return {
        "found":       True,
        "pct_pedro":   round(avg_pedro  / total * 100, 6),
        "pct_marina":  round(avg_marina / total * 100, 6),
        "window_size": len(window),
    }
