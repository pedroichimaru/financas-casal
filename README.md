# Finanças Casal

App de gestão financeira mensal de um casal: importa a fatura em XLSX, decide de quem é cada
despesa, rateia o que é da casa na proporção dos salários e acompanha o que ainda está em aberto.

**No ar:** https://financas-casal.pdic.dev

> Repositório **público**. Extratos, planilhas e o banco de dados nunca podem ser commitados —
> o `.gitignore` cobre `*.csv`, `*.xlsx`, `*.db`, `data/` e `backups/`.

## O que ele faz

| Seção | Para quê |
|---|---|
| **Início** | Visão do mês mais recente: total, divisão Pedro/Marina, saldo em aberto e o histórico em gráfico |
| **Importar** | Sobe o XLSX do mês; cada despesa já vem classificada e categorizada automaticamente |
| **Fechamento** | Tabela do mês para revisar e corrigir à mão, com os subtotais e o balanço de pagamentos |
| **Salários** | Salários mensais de cada um, que definem a proporção do rateio da casa |

Cada despesa carrega duas informações independentes: **apropriação** (de quem é o gasto —
Pedro, Marina, Casa ou 50/50) e **categoria** (o que foi — Mercado, Transporte, Restaurante…).

O que é **Casa** não é dividido meio a meio: entra na proporção da média móvel de 12 meses dos
salários. Se um ganha 60% da renda do casal, paga 60% da casa.

A classificação automática aprende com o histórico: quando a mesma despesa, no mesmo cartão,
já foi marcada da mesma forma em pelo menos 75% das vezes, ela vem marcada assim no próximo
import. Corrigir à mão hoje deixa o mês que vem mais certeiro.

## Rodando localmente

```bash
pip3 install -r requirements.txt
JWT_SECRET=qualquer-coisa-para-dev uvicorn main:app --reload --port 8000
```

Abre em `http://localhost:8000`. O banco é criado sozinho no primeiro start.
`JWT_SECRET` é obrigatório — sem ele o app não sobe.

## Stack

FastAPI + SQLite (`sqlite3` da stdlib, sem ORM) servindo HTML/CSS/JS puro — sem framework de
frontend e sem build step. Editou `static/`, atualiza a página e pronto.

```
main.py         endpoints + modelos
parser.py       lê o XLSX
classifier.py   decide de quem é a despesa
categorizer.py  decide o que a despesa é
database.py     todo o acesso ao SQLite
static/         a interface inteira
```

## Produção

Roda em container num servidor Hetzner, atrás do Caddy, que cuida do HTTPS sozinho.
**Push na `main` faz o deploy** — o GitHub Actions atualiza o servidor e só dá o run como
verde se a URL pública responder depois.

O banco é backupeado toda madrugada no próprio servidor, com verificação de integridade e
30 dias de retenção. Só isso: **não existe cópia fora do servidor**, então perder a máquina
perde o histórico.

Para conferir que uma cópia ou restauração do banco não perdeu nada:

```bash
python3 scripts/verify_db.py caminho/do/banco.db
```

Rode nos dois bancos e compare as saídas com `diff`.

Detalhes de arquitetura, regras de classificação e as armadilhas da infra estão no
[CLAUDE.md](CLAUDE.md).
