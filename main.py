import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path

import bcrypt
import jwt
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

from categorizer import categorize as categorize_expense
from classifier import classify
from database import (
    add_pagamento, build_categoria_lookup, build_classification_lookup,
    create_user, delete_expense, delete_mes, delete_pagamento,
    delete_pagamentos_by_mes, delete_salario, get_expenses_by_mes,
    get_historico_totais, get_meses, get_pagamentos, get_proporcao_for_mes,
    get_salarios, get_salarios_com_ordem, get_user_by_email, init_db,
    mes_sort_key, save_expenses, update_apropriacao, update_categoria,
    update_pagamento, update_user_password, upsert_salario,
)
from parser import parse_xlsx

STATIC_DIR = Path(__file__).parent / "static"

SECRET_KEY = os.environ["JWT_SECRET"]
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30
ALLOWED_EMAILS = {"pedroichimaru@gmail.com", "marina.daur@gmail.com"}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
limiter = Limiter(key_func=get_remote_address)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _create_token(email: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": email, "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise ValueError
        return email
    except Exception:
        raise HTTPException(status_code=401, detail="Não autenticado")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Finanças Casal", lifespan=lifespan)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


# ---------- Auth ----------

class RegisterIn(BaseModel):
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@app.post("/auth/register")
def auth_register(body: RegisterIn):
    if body.email not in ALLOWED_EMAILS:
        raise HTTPException(status_code=403, detail="E-mail não autorizado")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter pelo menos 6 caracteres")
    if get_user_by_email(body.email):
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")
    create_user(body.email, _hash_password(body.password))
    return {"access_token": _create_token(body.email), "token_type": "bearer"}


@app.post("/auth/login")
@limiter.limit("10/minute")
def auth_login(request: Request, body: LoginIn):
    user = get_user_by_email(body.email)
    if not user or not _verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    return {"access_token": _create_token(body.email), "token_type": "bearer"}


@app.get("/auth/me")
def auth_me(email: str = Depends(get_current_user)):
    return {"email": email}


@app.post("/auth/change-password")
def auth_change_password(body: ChangePasswordIn, email: str = Depends(get_current_user)):
    user = get_user_by_email(email)
    if not user or not _verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Senha atual incorreta")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Nova senha deve ter pelo menos 6 caracteres")
    update_user_password(email, _hash_password(body.new_password))
    return {"ok": True}


# ---------- Importar ----------

@app.post("/upload")
async def upload(file: UploadFile = File(...), mes: str = Form(...), _: str = Depends(get_current_user)):
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Arquivo deve ser .xlsx")

    content = await file.read()
    try:
        expenses = parse_xlsx(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    lookup     = build_classification_lookup()
    cat_lookup = build_categoria_lookup()
    for e in expenses:
        e["apropriacao"] = classify(e["despesa"], e["id"], e["portador"], lookup)
        e["categoria"]   = categorize_expense(e["despesa"], e["id"], e["portador"], cat_lookup)

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
def import_expenses(body: ImportRequest, _: str = Depends(get_current_user)):
    if body.mes in get_meses():
        raise HTTPException(status_code=409, detail=f"O mês {body.mes} já possui despesas importadas.")
    lookup     = build_classification_lookup()
    cat_lookup = build_categoria_lookup()
    classified = [
        {
            "data":        e.data,
            "despesa":     e.despesa,
            "valor":       e.valor,
            "id":          e.id,
            "portador":    e.portador,
            "apropriacao": classify(e.despesa, e.id, e.portador, lookup),
            "categoria":   categorize_expense(e.despesa, e.id, e.portador, cat_lookup),
        }
        for e in body.expenses
    ]
    save_expenses(body.mes, classified)
    return {"saved": len(classified), "mes": body.mes}


# ---------- Reclassificar ----------

VALID_APROPRIACOES = {"Pedro", "Marina", "Casa", "50/50"}

VALID_CATEGORIAS = {
    "Casa", "Conteúdo/Apps", "Mercado", "Restaurante/Delivery",
    "Saúde/Corrida", "Taxa/Burocracia", "Transporte/Uber",
    "Viagem/Presente", "Movimentação/Investimento", "Falta classificar",
}


class ApropriacaoUpdate(BaseModel):
    apropriacao: str


@app.patch("/expenses/{expense_id}/apropriacao")
def patch_apropriacao(expense_id: int, body: ApropriacaoUpdate, _: str = Depends(get_current_user)):
    if body.apropriacao not in VALID_APROPRIACOES:
        raise HTTPException(status_code=400, detail="Apropriação inválida")
    update_apropriacao(expense_id, body.apropriacao)
    return {"id": expense_id, "apropriacao": body.apropriacao}


class CategoriaUpdate(BaseModel):
    categoria: str


@app.patch("/expenses/{expense_id}/categoria")
def patch_categoria(expense_id: int, body: CategoriaUpdate, _: str = Depends(get_current_user)):
    if body.categoria not in VALID_CATEGORIAS:
        raise HTTPException(status_code=400, detail="Categoria inválida")
    update_categoria(expense_id, body.categoria)
    return {"id": expense_id, "categoria": body.categoria}


@app.delete("/expenses/{expense_id}")
def delete_expense_endpoint(expense_id: int, _: str = Depends(get_current_user)):
    delete_expense(expense_id)
    return {"deleted": expense_id}


@app.delete("/despesas")
def delete_mes_endpoint(mes: str, _: str = Depends(get_current_user)):
    delete_mes(mes)
    return {"deleted_mes": mes}


# ---------- Salários ----------

class SalarioIn(BaseModel):
    mes: str
    pedro: float
    marina: float


@app.get("/salarios")
def list_salarios(_: str = Depends(get_current_user)):
    return get_salarios()


@app.get("/salarios/proporcao")
def salario_proporcao(mes: str, _: str = Depends(get_current_user)):
    return get_proporcao_for_mes(mes)


@app.post("/salarios")
def save_salario(body: SalarioIn, _: str = Depends(get_current_user)):
    if body.pedro < 0 or body.marina < 0:
        raise HTTPException(status_code=400, detail="Salário não pode ser negativo")
    upsert_salario(body.mes, body.pedro, body.marina)
    return {"mes": body.mes, "pedro": body.pedro, "marina": body.marina}


@app.delete("/salarios")
def remove_salario(mes: str, _: str = Depends(get_current_user)):
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
def list_pagamentos(mes: str, _: str = Depends(get_current_user)):
    return get_pagamentos(mes)


@app.post("/pagamentos")
def create_pagamento(body: PagamentoIn, _: str = Depends(get_current_user)):
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
def edit_pagamento(pag_id: int, body: PagamentoUpdate, _: str = Depends(get_current_user)):
    if body.valor == 0:
        raise HTTPException(status_code=400, detail="Valor não pode ser zero")
    if body.apropriacao not in VALID_PAG_APROPRIACOES:
        raise HTTPException(status_code=400, detail="Apropriação inválida")
    update_pagamento(pag_id, body.data, body.pagamento, body.valor, body.apropriacao)
    return {"id": pag_id, "data": body.data, "pagamento": body.pagamento,
            "valor": body.valor, "apropriacao": body.apropriacao}


@app.delete("/pagamentos/{pag_id}")
def remove_pagamento(pag_id: int, _: str = Depends(get_current_user)):
    delete_pagamento(pag_id)
    return {"deleted": pag_id}


@app.delete("/pagamentos")
def remove_pagamentos_mes(mes: str, _: str = Depends(get_current_user)):
    delete_pagamentos_by_mes(mes)
    return {"deleted_mes": mes}


# ---------- Dashboard ----------

@app.get("/dashboard")
def dashboard(_: str = Depends(get_current_user)):
    meses = get_meses()
    if not meses:
        return {"has_data": False}

    ultimo = meses[0]

    # 3 queries regardless of number of months (was N*2 + 3)
    hist_totais  = get_historico_totais()
    pagamentos_u = get_pagamentos(ultimo)
    all_salarios = get_salarios_com_ordem()

    def _calc_prop(mes_ord: str) -> tuple[float, float]:
        eligible = [s for s in all_salarios if s["mes_ordem"] <= mes_ord]
        if not eligible:
            return 0.5, 0.5
        window = eligible[-12:]
        avg_p  = sum(s["pedro"]  for s in window) / len(window)
        avg_m  = sum(s["marina"] for s in window) / len(window)
        t = avg_p + avg_m
        return (avg_p / t, avg_m / t) if t > 0 else (0.5, 0.5)

    totais_u = hist_totais.get(ultimo, {"Pedro": 0.0, "Marina": 0.0, "Casa": 0.0, "50/50": 0.0})
    pp_u, pm_u = _calc_prop(mes_sort_key(ultimo))

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

    sal_data = None
    if all_salarios:
        win   = all_salarios[-12:]
        avg_p = sum(s["pedro"]  for s in win) / len(win)
        avg_m = sum(s["marina"] for s in win) / len(win)
        tot_s = avg_p + avg_m
        sal_data = {
            "mes":        all_salarios[-1]["mes"],
            "avgPedro":   round(avg_p, 2),
            "avgMarina":  round(avg_m, 2),
            "pctPedro":   round(avg_p / tot_s * 100, 2) if tot_s > 0 else 50,
            "pctMarina":  round(avg_m / tot_s * 100, 2) if tot_s > 0 else 50,
            "windowSize": len(win),
        }

    historico = []
    for mes in reversed(meses):
        tot = hist_totais.get(mes, {"Pedro": 0.0, "Marina": 0.0, "Casa": 0.0, "50/50": 0.0})
        pp, pm = _calc_prop(mes_sort_key(mes))
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
def list_meses(_: str = Depends(get_current_user)):
    return get_meses()


@app.get("/fechamento")
def fechamento(mes: str, _: str = Depends(get_current_user)):
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
