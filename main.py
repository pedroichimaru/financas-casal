from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from classifier import classify
from database import get_expenses_by_mes, get_meses, init_db, save_expenses
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
