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


def get_expenses_by_mes(mes: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT id, data, despesa, valor, id_origem, portador, apropriacao
               FROM despesas WHERE mes = ? ORDER BY rowid""",
            (mes,),
        ).fetchall()
        return [dict(r) for r in rows]
