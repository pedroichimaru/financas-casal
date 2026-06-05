import re

# Despesas que viram Casa mesmo em cartão individual Itaú Latam
_CASA_PATTERNS = [
    r"i\s*food|ifd\b",                                       # iFood
    r"\brappi\b|rpp\b",                                      # Rappi
    r"estapar|zona\s*azul|\bparking\b|\bpark\b|estacion",    # Estacionamento
    r"\bposto\b|autoposto|auto\s*posto|combustiv|"
    r"shell|ipiranga|br\s*mania|graal|petrobras|gasolina",   # Combustível
]


def _is_casa_expense(despesa: str) -> bool:
    return any(re.search(p, despesa, re.IGNORECASE) for p in _CASA_PATTERNS)


def _detect_person(portador: str, id_origem: str) -> str:
    combined = f"{portador} {id_origem}".lower()
    if "pedro" in combined:
        return "Pedro"
    if "marina" in combined:
        return "Marina"
    return "50/50"


def classify(despesa: str, id_origem: str, portador: str) -> str:
    combined = f"{portador} {id_origem}".lower()

    # Extrato / conta corrente → Casa
    if re.search(r"extrato|conta\s*corrente|\bcc\b", combined):
        return "Casa"

    # Santander Mastercard → Casa
    if "santander" in combined and re.search(r"master", combined):
        return "Casa"

    # Santander Visa → individual pelo portador
    if "santander" in combined and "visa" in combined:
        return _detect_person(portador, id_origem)

    # Itaú Latam → individual, exceto despesas Casa
    if re.search(r"ita[uú]|latam", combined):
        if _is_casa_expense(despesa):
            return "Casa"
        return _detect_person(portador, id_origem)

    return "50/50"
