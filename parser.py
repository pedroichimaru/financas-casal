import io
from datetime import datetime, date

import openpyxl


COLUMN_MAP = {
    "data": "data",
    "despesa": "despesa",
    "valor (r$)": "valor",
    "id": "id",
    "portador": "portador",
}


def _parse_date(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.strftime("%d/%m/%Y")
    s = str(value).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return s


def _parse_valor(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace("R$", "").replace(" ", "")
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_xlsx(file_bytes: bytes) -> list[dict]:
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    header = [str(c).strip().lower() if c is not None else "" for c in rows[0]]

    col_idx = {}
    for col_name, key in COLUMN_MAP.items():
        for i, h in enumerate(header):
            if h == col_name:
                col_idx[key] = i
                break

    missing = [k for k in COLUMN_MAP.values() if k not in col_idx]
    if missing:
        raise ValueError(f"Colunas não encontradas no XLSX: {', '.join(missing)}")

    expenses = []
    for row in rows[1:]:
        if all(cell is None or str(cell).strip() == "" for cell in row):
            continue

        expenses.append({
            "data": _parse_date(row[col_idx["data"]]),
            "despesa": str(row[col_idx["despesa"]] or "").strip(),
            "valor": _parse_valor(row[col_idx["valor"]]),
            "id": str(row[col_idx["id"]] or "").strip(),
            "portador": str(row[col_idx["portador"]] or "").strip(),
        })

    return expenses
