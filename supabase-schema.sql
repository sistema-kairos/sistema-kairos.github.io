-- Execute este script no Supabase: Dashboard > SQL Editor > New query > cole e rode.

-- Tabela única com os registros de todas as abas (comercial, cs, config, status, heartbeat).
create table if not exists public.registros (
  tabela     text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tabela, id)
);
create index if not exists registros_tabela_idx on public.registros (tabela, updated_at desc);

-- Segurança: apenas usuários logados leem e gravam.
alter table public.registros enable row level security;

drop policy if exists "usuarios logados leem" on public.registros;
create policy "usuarios logados leem" on public.registros
  for select to authenticated using (true);

drop policy if exists "usuarios logados gravam" on public.registros;
create policy "usuarios logados gravam" on public.registros
  for all to authenticated using (true) with check (true);

-- Heartbeat: permite que sistemas externos (ex.: serviço de push de pedidos)
-- avisem que estão vivos sem precisar de login. Só aceita os IDs listados abaixo
-- e só altera o horário do último sinal.
create or replace function public.heartbeat(servico text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if servico not in ('push_pedidos', 'chatpro', 'hub_savassi', 'hub_cidadenova', 'hub_pampulha', 'hub_buritis') then
    raise exception 'servico desconhecido: %', servico;
  end if;
  insert into registros (tabela, id, data, updated_at)
  values ('heartbeat', servico, jsonb_build_object('at', now()), now())
  on conflict (tabela, id) do update set data = excluded.data, updated_at = now();
end;
$$;

revoke all on function public.heartbeat(text) from public;
grant execute on function public.heartbeat(text) to anon, authenticated;

-- Formulário público (formulario-midias-sociais.html): grava as respostas na tabela 'leads' sem precisar de login.
-- Aceita só os campos do formulário, limita o tamanho dos textos e não permite ler nem alterar nada.
create or replace function public.enviar_lead(dados jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_id text := gen_random_uuid()::text;
  campos text[] := array['nome', 'telefone', 'email', 'situacao_delivery', 'vende_apps', 'pedidos_mes',
                         'nome_loja', 'prazo_inicio', 'ideia', 'utm_source', 'utm_medium', 'utm_campaign'];
  limpo jsonb := '{}'::jsonb;
  c text;
begin
  if coalesce(trim(dados->>'nome'), '') = '' or coalesce(trim(dados->>'telefone'), '') = '' then
    raise exception 'nome e telefone são obrigatórios';
  end if;
  foreach c in array campos loop
    if jsonb_typeof(dados->c) = 'string' and trim(dados->>c) <> '' then
      limpo := limpo || jsonb_build_object(c, left(trim(dados->>c), case when c = 'ideia' then 4000 else 200 end));
    end if;
  end loop;
  limpo := limpo || jsonb_build_object('status', 'Novo', 'recebido_em', now());
  insert into registros (tabela, id, data, updated_at) values ('leads', novo_id, limpo, now());
  return novo_id;
end;
$$;

revoke all on function public.enviar_lead(jsonb) from public;
grant execute on function public.enviar_lead(jsonb) to anon, authenticated;

-- faz a API do Supabase enxergar as funções novas imediatamente
notify pgrst, 'reload schema';
