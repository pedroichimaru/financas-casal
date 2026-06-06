from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from classifier import classify
from database import (
    add_pagamento, delete_expense, delete_mes,
    delete_pagamento, delete_pagamentos_by_mes, delete_salario,
    get_conn, get_expenses_by_mes, get_meses, get_pagamentos, get_proporcao_for_mes,
    get_salarios, init_db, save_expenses,
    update_apropriacao, update_pagamento, upsert_salario,
)
from parser import parse_xlsx

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Finanças Casal", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


# ---------- Importar ----------

@app.post("/upload")
async def upload(file: UploadFile = File(...), mes: str = Form(...)):
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Arquivo deve ser .xlsx")

    content = await file.read()
    try:
        expenses = parse_xlsx(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    total = round(sum(e["valor"] for e in expenses), 2)
    return {"expenses": expenses, "total": total, "count": len(expenses), "mes": mes}


class ExpenseIn(BaseModel):
    data: str
    despesa: str
    valor: float
    id: str
    portador: str


class ImportRequest(BaseModel):
    mes: str
    expenses: list[ExpenseIn]


@app.post("/import")
def import_expenses(body: ImportRequest):
    classified = [
        {
            "data": e.data,
            "despesa": e.despesa,
            "valor": e.valor,
            "id": e.id,
            "portador": e.portador,
            "apropriacao": classify(e.despesa, e.id, e.portador),
        }
        for e in body.expenses
    ]
    save_expenses(body.mes, classified)
    return {"saved": len(classified), "mes": body.mes}


# ---------- Reclassificar ----------

VALID_APROPRIACOES = {"Pedro", "Marina", "Casa", "50/50"}


class ApropriacaoUpdate(BaseModel):
    apropriacao: str


@app.patch("/expenses/{expense_id}/apropriacao")
def patch_apropriacao(expense_id: int, body: ApropriacaoUpdate):
    if body.apropriacao not in VALID_APROPRIACOES:
        raise HTTPException(status_code=400, detail="Apropriação inválida")
    update_apropriacao(expense_id, body.apropriacao)
    return {"id": expense_id, "apropriacao": body.apropriacao}


@app.delete("/expenses/{expense_id}")
def delete_expense_endpoint(expense_id: int):
    delete_expense(expense_id)
    return {"deleted": expense_id}


@app.delete("/despesas")
def delete_mes_endpoint(mes: str):
    delete_mes(mes)
    return {"deleted_mes": mes}


# ---------- Salários ----------

class SalarioIn(BaseModel):
    mes: str
    pedro: float
    marina: float


@app.get("/salarios")
def list_salarios():
    return get_salarios()


@app.get("/salarios/proporcao")
def salario_proporcao(mes: str):
    return get_proporcao_for_mes(mes)


@app.post("/salarios")
def save_salario(body: SalarioIn):
    if body.pedro < 0 or body.marina < 0:
        raise HTTPException(status_code=400, detail="Salário não pode ser negativo")
    upsert_salario(body.mes, body.pedro, body.marina)
    return {"mes": body.mes, "pedro": body.pedro, "marina": body.marina}


@app.delete("/salarios")
def remove_salario(mes: str):
    delete_salario(mes)
    return {"deleted_mes": mes}


# ---------- Pagamentos ----------

VALID_PAG_APROPRIACOES = {"Pedro", "Casa", "50/50"}


class PagamentoIn(BaseModel):
    mes: str
    data: str
    pagamento: str
    valor: float
    apropriacao: str = "Pedro"


@app.get("/pagamentos")
def list_pagamentos(mes: str):
    return get_pagamentos(mes)


@app.post("/pagamentos")
def create_pagamento(body: PagamentoIn):
    if body.valor == 0:
        raise HTTPException(status_code=400, detail="Valor não pode ser zero")
    if body.apropriacao not in VALID_PAG_APROPRIACOES:
        raise HTTPException(status_code=400, detail="Apropriação inválida")
    return add_pagamento(body.mes, body.data, body.pagamento, body.valor, body.apropriacao)


class PagamentoUpdate(BaseModel):
    data: str
    pagamento: str
    valor: float
    apropriacao: str = "Pedro"


@app.patch("/pagamentos/{pag_id}")
def edit_pagamento(pag_id: int, body: PagamentoUpdate):
    if body.valor == 0:
        raise HTTPException(status_code=400, detail="Valor não pode ser zero")
    if body.apropriacao not in VALID_PAG_APROPRIACOES:
        raise HTTPException(status_code=400, detail="Apropriação inválida")
    update_pagamento(pag_id, body.data, body.pagamento, body.valor, body.apropriacao)
    return {"id": pag_id, "data": body.data, "pagamento": body.pagamento,
            "valor": body.valor, "apropriacao": body.apropriacao}


@app.delete("/pagamentos/{pag_id}")
def remove_pagamento(pag_id: int):
    delete_pagamento(pag_id)
    return {"deleted": pag_id}


@app.delete("/pagamentos")
def remove_pagamentos_mes(mes: str):
    delete_pagamentos_by_mes(mes)
    return {"deleted_mes": mes}


# ---------- Import Histórico (temporário) ----------

class HistoricoItem(BaseModel):
    mes: str
    pedro: float
    marina: float
    data_primeiro: str
    data_ultimo: str


@app.post("/import-historico")
def import_historico(items: list[HistoricoItem]):
    with get_conn() as conn:
        for item in items:
            conn.execute("DELETE FROM pagamentos WHERE mes = ?", (item.mes,))
        conn.commit()
    for item in items:
        save_expenses(item.mes, [
            {"data": item.data_primeiro, "despesa": "Total Pedro",  "valor": item.pedro,
             "id": "Manual", "portador": "PEDRO ICHIMARU BEDENDO", "apropriacao": "Pedro"},
            {"data": item.data_primeiro, "despesa": "Total Marina", "valor": item.marina,
             "id": "Manual", "portador": "MARINA JACOB DAUR",      "apropriacao": "Marina"},
        ])
        add_pagamento(item.mes, item.data_ultimo,
                      "Balanço Antigo já fechado", item.marina, "Pedro")
    return {"imported": len(items)}


# ---------- Dashboard ----------

@app.get("/dashboard")
def dashboard():
    meses = get_meses()
    if not meses:
        return {"has_data": False}

    ultimo = meses[0]
    expenses_u   = get_expenses_by_mes(ultimo)
    prop_u       = get_proporcao_for_mes(ultimo)
    pagamentos_u = get_pagamentos(ultimo)

    totais_u: dict[str, float] = {"Pedro": 0, "Marina": 0, "Casa": 0, "50/50": 0}
    for e in expenses_u:
        a = e.get("apropriacao") or "50/50"
        if a in totais_u:
            totais_u[a] += e["valor"]

    pp_u = prop_u["pct_pedro"]  / 100 if prop_u["found"] else 0.5
    pm_u = prop_u["pct_marina"] / 100 if prop_u["found"] else 0.5

    total_geral_u  = sum(totais_u.values())
    total_pedro_u  = totais_u["Pedro"]  + totais_u["Casa"] * pp_u + totais_u["50/50"] * 0.5
    total_marina_u = totais_u["Marina"] + totais_u["Casa"] * pm_u + totais_u["50/50"] * 0.5

    def _abat(p: dict) -> float:
        aprop = p.get("apropriacao", "Pedro")
        v = p["valor"]
        if aprop == "Pedro": return v
        if aprop == "50/50": return v * 0.5
        if aprop == "Casa":  return v * pp_u
        return v

    total_abat_u = sum(_abat(p) for p in pagamentos_u)
    saldo_u      = total_marina_u - total_abat_u

    # Salários – most recent rolling average
    salarios = get_salarios()
    sal_data = None
    if salarios:
        win   = salarios[-12:]
        avg_p = sum(s["pedro"]  for s in win) / len(win)
        avg_m = sum(s["marina"] for s in win) / len(win)
        tot_s = avg_p + avg_m
        sal_data = {
            "mes":        salarios[-1]["mes"],
            "avgPedro":   round(avg_p, 2),
            "avgMarina":  round(avg_m, 2),
            "pctPedro":   round(avg_p / tot_s * 100, 2) if tot_s > 0 else 50,
            "pctMarina":  round(avg_m / tot_s * 100, 2) if tot_s > 0 else 50,
            "windowSize": len(win),
        }

    # Historico – last 12 months oldest first
    historico = []
    for mes in reversed(meses[:12]):
        exp  = get_expenses_by_mes(mes)
        prop = get_proporcao_for_mes(mes)
        tot: dict[str, float] = {"Pedro": 0, "Marina": 0, "Casa": 0, "50/50": 0}
        for e in exp:
            a = e.get("apropriacao") or "50/50"
            if a in tot:
                tot[a] += e["valor"]
        pp = prop["pct_pedro"]  / 100 if prop["found"] else 0.5
        pm = prop["pct_marina"] / 100 if prop["found"] else 0.5
        total  = sum(tot.values())
        pedro  = tot["Pedro"]  + tot["Casa"] * pp + tot["50/50"] * 0.5
        marina = tot["Marina"] + tot["Casa"] * pm + tot["50/50"] * 0.5
        historico.append({
            "mes":    mes,
            "total":  round(total,  2),
            "pedro":  round(pedro,  2),
            "marina": round(marina, 2),
        })

    return {
        "has_data": True,
        "ultimo_mes": {
            "mes":               ultimo,
            "total_geral":       round(total_geral_u,  2),
            "total_pedro":       round(total_pedro_u,  2),
            "total_marina":      round(total_marina_u, 2),
            "total_abatimentos": round(total_abat_u,   2),
            "saldo_aberto":      round(saldo_u,        2),
        },
        "salarios": sal_data,
        "historico": historico,
    }


# ---------- Fechamento ----------

@app.get("/meses")
def list_meses():
    return get_meses()


@app.get("/fechamento")
def fechamento(mes: str):
    expenses = get_expenses_by_mes(mes)

    totais: dict[str, float] = {"Pedro": 0.0, "Marina": 0.0, "Casa": 0.0, "50/50": 0.0}
    for e in expenses:
        aprop = e.get("apropriacao") or "50/50"
        if aprop in totais:
            totais[aprop] += e["valor"]

    totais = {k: round(v, 2) for k, v in totais.items()}
    total_geral = round(sum(totais.values()), 2)

    return {
        "mes": mes,
        "expenses": expenses,
        "totais": totais,
        "total_geral": total_geral,
    }
