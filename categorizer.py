import re
import unicodedata

_CATEGORIES = [
    ("Movimentação/Investimento", [
        r"invest|resgate|aplicac|rendiment|dividend|poupanca|cdb\b|lci\b|lca\b|fundo\s*(imob|invest|acoes)|selic|tesouro|btg|xp\s*invest",
    ]),
    ("Taxa/Burocracia", [
        r"\biof\b|darf|imposto|taxa\s|cartorio|multa|anuidade|seguro|ipva|licenciament|juros|encargo|deducao",
    ]),
    ("Saúde/Corrida", [
        r"farmac|drogasil|ultrafarma|pacheco|droga\s*raia|remedios?|medicament|plano.*saude|saude\s|medico|clinica|hospital|dentista|odonto|academia|pilates|yoga|smartfit|bio\s*ritmo|fitness|consulta|exame|psicologo|terapia|fleury|hermes\s*pardini|centauro|decathlon|corrida|maratona",
    ]),
    ("Restaurante/Delivery", [
        r"i\s*food|ifd\b|rappi|rpp\b|uber.{0,5}eats|restaur|lanchon|pizzar|sushi|hamburguer|burger|cafeter|\bcafe\b|padaria|acai|james.*deliv|delivery\b|boteco|bistro",
    ]),
    ("Mercado", [
        r"mercado|supermercado|carrefour|\bextra\b|pao\s*de\s*acucar|sonda|hortifruti|st\s*marche|mambo|eataly|sacolao|emporio\b|hiper|atacadao|assai|makro|zona\s*sul|mundo\s*animal|petz|cobasi",
    ]),
    ("Transporte/Uber", [
        r"\buber\b|99\s*app|\btaxi\b|estapar|zona\s*azul|\bparking\b|\bpark\b|estacion|pedagio|combustiv|gasolina|alcool\b|etanol|posto\b|shell|ipiranga|br\s*mania|graal|petrobras|metro|onibus|sptrans|bilhete\s*unico|99pop",
    ]),
    ("Conteúdo/Apps", [
        r"netflix|spotify|hbo|disney|apple\s*(one|tv|music)|google|youtube|kindle|steam|\bpsn\b|playstation|xbox|nintendo|adobe|dropbox|icloud|globoplay|amazon|deezer|crunchyroll|paramount|mubi|telecine|microsoft|chatgpt",
    ]),
    ("Viagem/Presente", [
        r"hotel|pousada|hosped|passagem|aerea|latam\s*(airline|pass|linhas)|vrbo|airbnb|booking|resort|cruzeiro|excursao|presente|souvenir",
    ]),
    ("Casa", [
        r"condomin|sabesp|agua\b|enel|comgas|\bgas\b|aluguel|iptu|reforma|manutenc|faxina|limpeza|leroy|telhanorte|tok.*stok|internet|fibra|banda\s*larg|wi.?fi|\bnet\b|claro|vivo|tim\b|sky\b|mobilia|moveis|decorac",
    ]),
]


def _normalize(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def categorize(despesa: str, id_origem: str, portador: str, lookup: dict | None = None) -> str:
    # 1. Historical lookup: same (despesa, id, portador) classified ≥75% of the time
    if lookup is not None:
        key = (
            (despesa   or "").strip().lower(),
            (id_origem or "").strip().lower(),
            (portador  or "").strip().lower(),
        )
        counts = lookup.get(key)
        if counts:
            dominant = max(counts, key=counts.get)
            if counts[dominant] / sum(counts.values()) >= 0.75:
                return dominant

    # 2. Regex on normalized despesa name
    norm = _normalize(despesa or "")
    for categoria, patterns in _CATEGORIES:
        for pattern in patterns:
            if re.search(pattern, norm, re.IGNORECASE):
                return categoria

    return "Falta classificar"
