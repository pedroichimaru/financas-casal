#!/usr/bin/env python3
"""Sanity check de um financas.db.

Uso: python3 scripts/verify_db.py caminho/para/financas.db

Rodar no arquivo baixado do Render e de novo no servidor depois do restore.
As duas saidas tem que bater linha a linha — eh a prova de que nada se perdeu.
"""
import sqlite3
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "financas.db"
conn = sqlite3.connect(path)
conn.row_factory = sqlite3.Row


def scalar(sql):
    try:
        return conn.execute(sql).fetchone()[0]
    except sqlite3.OperationalError as e:
        return f"ERRO ({e})"


print(f"arquivo: {path}\n")

for t in ("despesas", "pagamentos", "salarios", "users"):
    print(f"  {t:12} {scalar(f'SELECT COUNT(*) FROM {t}')}")

print()
print(f"  soma despesas    {scalar('SELECT ROUND(SUM(valor),2) FROM despesas')}")
print(f"  soma pagamentos  {scalar('SELECT ROUND(SUM(valor),2) FROM pagamentos')}")
print(f"  meses distintos  {scalar('SELECT COUNT(DISTINCT mes) FROM despesas')}")

print("\nper mes:")
for r in conn.execute(
    "SELECT mes, COUNT(*) n, ROUND(SUM(valor),2) v FROM despesas "
    "GROUP BY mes, mes_ordem ORDER BY mes_ordem"
):
    print(f"  {r['mes']:20} {r['n']:>5} linhas  R$ {r['v']}")

print("\napropriacao:")
for r in conn.execute(
    "SELECT apropriacao, COUNT(*) n FROM despesas GROUP BY apropriacao ORDER BY n DESC"
):
    print(f"  {str(r['apropriacao']):20} {r['n']:>5}")

print("\ncategoria:")
for r in conn.execute(
    "SELECT categoria, COUNT(*) n FROM despesas GROUP BY categoria ORDER BY n DESC"
):
    print(f"  {str(r['categoria']):20} {r['n']:>5}")

print("\nusuarios:", [r[0] for r in conn.execute("SELECT email FROM users ORDER BY email")])
print("integrity_check:", scalar("PRAGMA integrity_check"))
