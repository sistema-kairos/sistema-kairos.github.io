#!/bin/bash
# Aplica no Supabase as migrações de supabase/migrations/ que ainda não foram aplicadas.
# Usa a API oficial do Supabase (Management API) com um token guardado no Chaves (Keychain) do Mac:
#   security add-generic-password -a supabase -s gestao-hubs-supabase -w
# O histórico fica no próprio banco, na tabela privado.migracoes (fora do alcance da API pública do site).
# Uso: scripts/aplicar-sql.sh           → aplica as pendentes
#      scripts/aplicar-sql.sh --status  → só lista o que falta
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN=$(security find-generic-password -a supabase -s gestao-hubs-supabase -w 2>/dev/null) || {
  echo "Token do Supabase não encontrado no Keychain (serviço gestao-hubs-supabase)." >&2; exit 1; }
REF=$(sed -nE "s#.*supabaseUrl: 'https://([a-z0-9]+)\.supabase\.co'.*#\1#p" config.js)
[ -n "$REF" ] || { echo "Não achei o projeto do Supabase no config.js" >&2; exit 1; }

sql() { # executa SQL e imprime a resposta JSON; falha se a API devolver erro
  local body resp code
  body=$(python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))')
  resp=$(curl -sS -w '\n%{http_code}' -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary "$body")
  code=${resp##*$'\n'}; resp=${resp%$'\n'*}
  if [ "$code" -ge 300 ]; then echo "ERRO $code: $resp" >&2; return 1; fi
  echo "$resp"
}

echo "create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
create table if not exists privado.migracoes (nome text primary key, aplicada_em timestamptz not null default now());" | sql >/dev/null

APLICADAS=$(echo "select coalesce(json_agg(nome), '[]') as n from privado.migracoes;" | sql | python3 -c 'import json,sys; print("\n".join(json.load(sys.stdin)[0]["n"]))')

PENDENTES=()
for f in supabase/migrations/*.sql; do
  nome=$(basename "$f")
  grep -qxF "$nome" <<< "$APLICADAS" || PENDENTES+=("$f")
done

if [ ${#PENDENTES[@]} -eq 0 ]; then echo "Banco em dia: nenhuma migração pendente."; exit 0; fi
if [ "${1:-}" = "--status" ]; then printf 'Pendente: %s\n' "${PENDENTES[@]}"; exit 0; fi

for f in "${PENDENTES[@]}"; do
  nome=$(basename "$f")
  # migração + registro na mesma transação: ou aplica tudo, ou nada
  { echo "begin;"; cat "$f"; echo; echo "insert into privado.migracoes (nome) values ('$nome');"; echo "commit;"; } | sql >/dev/null
  echo "Aplicada: $nome"
done
echo "notify pgrst, 'reload schema';" | sql >/dev/null
echo "Pronto: ${#PENDENTES[@]} migração(ões) aplicada(s)."
