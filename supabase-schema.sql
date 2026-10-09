-- Execute este script no Supabase: Dashboard > SQL Editor > New query > cole e rode.

-- Tabela única com os registros de todas as abas (comercial, crm, cs, leads, ind_*, sprints, margem, perfis, config, status, heartbeat).
create table if not exists public.registros (
  tabela     text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tabela, id)
);
create index if not exists registros_tabela_idx on public.registros (tabela, updated_at desc);

-- ---------------------------------------------------------------------------
-- Permissões por perfil (aba Sistema → Permissões)
-- Os perfis ficam em registros com tabela = 'perfis' e id = e-mail do usuário (minúsculo):
--   papel: 'Administrador' | 'Utilizador' | 'Espectador'
--   area:  'Comercial' | 'CS' | 'MKT' | 'Todas as áreas' (só Espectador)
-- Enquanto nenhum Administrador for cadastrado, todo usuário logado tem acesso total
-- (assim ninguém fica trancado para fora ao ativar as permissões).
-- ---------------------------------------------------------------------------
alter table public.registros enable row level security;

create or replace function public.area_da_tabela(t text)
returns text language sql immutable as $$
  select case t
    when 'comercial' then 'Comercial' when 'crm' then 'Comercial' when 'ind_comercial' then 'Comercial'
    when 'cs' then 'CS' when 'ind_cs' then 'CS'
    when 'leads' then 'MKT' when 'ind_mkt' then 'MKT' when 'visitas' then 'MKT'
    when 'perfis' then 'admin' when 'margem' then 'admin'
    else 'geral' end
$$;

create or replace function public.existe_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from registros where tabela = 'perfis' and data->>'papel' = 'Administrador')
$$;

create or replace function public.perfil_atual()
returns jsonb language sql stable security definer set search_path = public as $$
  select data from registros where tabela = 'perfis' and id = lower(coalesce(auth.jwt()->>'email', ''))
$$;

-- Comercial e CS consultam (sem editar) os cadastros um do outro: os dashboards cruzam esses dados.
-- Marketing consulta (sem editar) o CRM: leads por canal, vendas, conversão, CPA e retorno.
create or replace function public.pode_ler(t text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  p jsonb;
  a text := area_da_tabela(t);
begin
  if not existe_admin() then return true; end if;
  p := perfil_atual();
  if p is null then return false; end if;
  if p->>'papel' = 'Administrador' then return true; end if;
  if a = 'geral' then return true; end if;
  if a = 'admin' then return false; end if;
  if p->>'papel' = 'Espectador' and coalesce(p->>'area', 'Todas as áreas') = 'Todas as áreas' then return true; end if;
  return p->>'area' = a or (p->>'area' in ('Comercial', 'CS') and t in ('comercial', 'cs'))
    or (p->>'area' = 'MKT' and t = 'crm');
end;
$$;

create or replace function public.pode_escrever(t text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  p jsonb;
begin
  if not existe_admin() then return true; end if;
  p := perfil_atual();
  if p is null then return false; end if;
  if p->>'papel' = 'Administrador' then return true; end if;
  if p->>'papel' <> 'Utilizador' then return false; end if;
  -- Sprints: toda a equipe (Utilizadores de qualquer área) edita; Status dos Sistemas: só administradores
  return t = 'sprints' or p->>'area' = area_da_tabela(t);
end;
$$;

-- perfil do usuário logado (usado pelo site para montar o menu)
create or replace function public.meu_perfil()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not existe_admin() then
    return jsonb_build_object('papel', 'Administrador', 'bootstrap', true);
  end if;
  return coalesce(perfil_atual(), '{}'::jsonb);
end;
$$;
revoke all on function public.meu_perfil() from public;
grant execute on function public.meu_perfil() to authenticated;

-- remove as regras antigas (acesso total a qualquer usuário logado)
drop policy if exists "usuarios logados leem" on public.registros;
drop policy if exists "usuarios logados gravam" on public.registros;
drop policy if exists "ler conforme perfil" on public.registros;
drop policy if exists "inserir conforme perfil" on public.registros;
drop policy if exists "alterar conforme perfil" on public.registros;
drop policy if exists "excluir conforme perfil" on public.registros;

create policy "ler conforme perfil" on public.registros
  for select to authenticated using (pode_ler(tabela));
create policy "inserir conforme perfil" on public.registros
  for insert to authenticated with check (pode_escrever(tabela));
create policy "alterar conforme perfil" on public.registros
  for update to authenticated using (pode_escrever(tabela)) with check (pode_escrever(tabela));
create policy "excluir conforme perfil" on public.registros
  for delete to authenticated using (pode_escrever(tabela));

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
  crm_id text := gen_random_uuid()::text;
  campos text[] := array['nome', 'telefone', 'email', 'situacao_delivery', 'vende_apps', 'pedidos_mes',
                         'nome_loja', 'prazo_inicio', 'ideia', 'utm_source', 'utm_medium', 'utm_campaign'];
  limpo jsonb := '{}'::jsonb;
  c text;
  -- teste diário automático (Status dos Sistemas): grava e desfaz, sem entrar em Leads nem no CRM
  teste boolean := dados ? 'teste';
begin
  if teste and (dados->>'teste') is distinct from (select valor from privado.ajustes where chave = 'teste_formulario_segredo') then
    raise exception 'teste inválido';
  end if;
  if coalesce(trim(dados->>'nome'), '') = '' or coalesce(trim(dados->>'telefone'), '') = '' then
    raise exception 'nome e telefone são obrigatórios';
  end if;
  foreach c in array campos loop
    if jsonb_typeof(dados->c) = 'string' and trim(dados->>c) <> '' then
      limpo := limpo || jsonb_build_object(c, left(trim(dados->>c), case when c = 'ideia' then 4000 else 200 end));
    end if;
  end loop;
  limpo := limpo || jsonb_build_object('status', 'Novo', 'recebido_em', now(), 'crm_id', crm_id);
  begin
  insert into registros (tabela, id, data, updated_at) values ('leads', novo_id, limpo, now());

  -- cada resposta do formulário vira uma negociação no CRM, na etapa "Sem contato"
  insert into registros (tabela, id, data, updated_at) values ('crm', crm_id, jsonb_strip_nulls(jsonb_build_object(
    'titulo', limpo->>'nome' || coalesce(' - ' || (limpo->>'nome_loja'), ''),
    'etapa', 'Sem contato',
    'etapa_desde', now(),
    'criado_em', now(),
    'fonte', 'Formulário - Mídias sociais' || coalesce(' (' || (limpo->>'utm_source') || ')', ''),
    'campanha', limpo->>'utm_campaign',
    'num_pedidos', limpo->>'pedidos_mes',
    'situacao_delivery', limpo->>'situacao_delivery',
    'vende_apps', limpo->>'vende_apps',
    'prazo_inicio', limpo->>'prazo_inicio',
    'anotacoes', limpo->>'ideia',
    'contatos', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'nome', limpo->>'nome', 'telefone', limpo->>'telefone', 'email', limpo->>'email'))),
    'empresa', jsonb_strip_nulls(jsonb_build_object('nome', limpo->>'nome_loja', 'num_pedidos', limpo->>'pedidos_mes')),
    'lead_id', novo_id,
    'historico', jsonb_build_array(jsonb_build_object('etapa', 'Sem contato', 'em', now(), 'por', 'Formulário'))
  )), now());
  if teste then raise exception 'teste_formulario_ok'; end if;   -- desfaz as duas gravações
  exception when raise_exception then
    if teste and sqlerrm = 'teste_formulario_ok' then return 'teste-ok'; end if;
    raise;
  end;
  return novo_id;
end;
$$;

revoke all on function public.enviar_lead(jsonb) from public;
grant execute on function public.enviar_lead(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aviso por e-mail: a cada nova solicitação de aviso prévio (tabela 'cs'), o banco
-- chama o Google Apps Script da conta arthurrocha@orioncloudkitchens.com.br, que envia
-- o e-mail para a lista definida em Configurações (config/notificacoes).
-- O endereço do Apps Script fica no esquema "privado", que não é acessível pela API.
-- ---------------------------------------------------------------------------
create extension if not exists pg_net;
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
create table if not exists privado.ajustes (chave text primary key, valor text);

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select not existe_admin() or coalesce(perfil_atual()->>'papel', '') = 'Administrador'
$$;

create or replace function public.enviar_email_aviso(registro jsonb, teste boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  url text;
  cfg jsonb;
begin
  select valor into url from privado.ajustes where chave = 'email_webhook_url';
  select data into cfg from registros where tabela = 'config' and id = 'notificacoes';
  if url is null or jsonb_typeof(cfg->'emails_aviso_previo') <> 'array' or jsonb_array_length(cfg->'emails_aviso_previo') = 0 then
    return false;
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('tipo', 'aviso_previo', 'teste', teste, 'para', cfg->'emails_aviso_previo',
                               'registro', registro, 'link', coalesce(cfg->>'site_url', '') || 'cs.html'),
    timeout_milliseconds := 10000);
  return true;
end;
$$;
revoke all on function public.enviar_email_aviso(jsonb, boolean) from public, anon, authenticated;

create or replace function public.avisar_aviso_previo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform enviar_email_aviso(new.data);
  return new;
exception when others then
  raise warning 'aviso por e-mail não enviado: %', sqlerrm;  -- nunca impede o cadastro
  return new;
end;
$$;

-- só cadastros novos disparam o e-mail (edições não)
drop trigger if exists aviso_previo_email on public.registros;
create trigger aviso_previo_email after insert on public.registros
  for each row when (new.tabela = 'cs') execute function public.avisar_aviso_previo();

-- usadas pela página Configurações (somente administradores)
create or replace function public.definir_webhook_email(url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'apenas administradores'; end if;
  if coalesce(trim(url), '') = '' then
    delete from privado.ajustes where chave = 'email_webhook_url';
  elsif trim(url) !~ '^https://script\.google\.com/' then
    raise exception 'o endereço deve ser do Google Apps Script (https://script.google.com/...)';
  else
    insert into privado.ajustes values ('email_webhook_url', trim(url))
      on conflict (chave) do update set valor = excluded.valor;
  end if;
end;
$$;

create or replace function public.status_email()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'apenas administradores'; end if;
  return jsonb_build_object('configurado', exists (select 1 from privado.ajustes where chave = 'email_webhook_url'));
end;
$$;

create or replace function public.testar_email()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'apenas administradores'; end if;
  return enviar_email_aviso(jsonb_build_object(
    'loja', 'Loja de teste', 'nome_cliente', 'Cliente de teste', 'hub', 'Savassi', 'mensalidade_fixa', 1500,
    'data_solicitacao', to_char(now(), 'YYYY-MM-DD'), 'aviso_previo_dias', 30,
    'data_saida_prevista', to_char(now() + interval '30 days', 'YYYY-MM-DD'), 'reuniao_ap', 'Pendente',
    'observacoes', 'Este é um e-mail de teste da automação de aviso prévio.'), true);
end;
$$;
revoke all on function public.definir_webhook_email(text) from public;
revoke all on function public.status_email() from public;
revoke all on function public.testar_email() from public;
grant execute on function public.definir_webhook_email(text) to authenticated;
grant execute on function public.status_email() to authenticated;
grant execute on function public.testar_email() to authenticated;

-- faz a API do Supabase enxergar as funções novas imediatamente
notify pgrst, 'reload schema';

-- Formulário público: conta uma visita por dia (o navegador só chama uma vez por dia).
-- Registro 'visitas' id 'formulario_AAAA-MM-DD' → { pagina, dia, n }
create or replace function public.registrar_visita(pagina text)
returns void language plpgsql security definer set search_path = public as $$
declare
  dia text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  if pagina not in ('formulario') then raise exception 'pagina desconhecida: %', pagina; end if;
  insert into registros (tabela, id, data, updated_at)
  values ('visitas', pagina || '_' || dia, jsonb_build_object('pagina', pagina, 'dia', dia, 'n', 1), now())
  on conflict (tabela, id) do update
    set data = jsonb_set(registros.data, '{n}', to_jsonb(coalesce((registros.data->>'n')::int, 0) + 1)), updated_at = now();
end;
$$;
revoke all on function public.registrar_visita(text) from public;
grant execute on function public.registrar_visita(text) to anon, authenticated;

-- Teste diário do formulário de leads (Status dos Sistemas), todo dia às 9h (12:00 UTC).
-- 1) baixa a página publicada e o config.js; 2) envia uma resposta de teste pela mesma API do formulário.
-- A resposta de teste passa por toda a validação e é gravada e desfeita na mesma hora: não entra em Leads nem no CRM.
-- O resultado fica em registros (tabela 'heartbeat', id 'formulario').
-- Endereços usados (privado.ajustes): site_url, supabase_url, supabase_anon_key e teste_formulario_segredo.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

insert into privado.ajustes values ('teste_formulario_segredo', md5(random()::text || clock_timestamp()::text) || md5(random()::text))
  on conflict (chave) do nothing;

create table if not exists privado.teste_formulario (
  id bigserial primary key,
  iniciado_em timestamptz not null default now(),
  req_pagina bigint, req_config bigint, req_envio bigint,
  concluido boolean not null default false);

create or replace function privado.teste_formulario_iniciar()
returns bigint language plpgsql security definer set search_path = public, privado as $$
declare
  v_site text := (select valor from privado.ajustes where chave = 'site_url');
  v_url text := (select valor from privado.ajustes where chave = 'supabase_url');
  v_key text := (select valor from privado.ajustes where chave = 'supabase_anon_key');
  v_seg text := (select valor from privado.ajustes where chave = 'teste_formulario_segredo');
  ts text := extract(epoch from now())::bigint::text;
  r1 bigint; r2 bigint; r3 bigint; novo bigint;
begin
  r1 := net.http_get(v_site || 'formulario-midias-sociais.html?verificacao=' || ts, timeout_milliseconds := 20000);
  r2 := net.http_get(v_site || 'config.js?verificacao=' || ts, timeout_milliseconds := 20000);
  r3 := net.http_post(url := v_url || '/rest/v1/rpc/enviar_lead',
    body := jsonb_build_object('dados', jsonb_build_object(
      'nome', 'Teste automático do sistema', 'telefone', '(31) 90000-0000', 'email', 'teste@orion.invalid',
      'nome_loja', 'Teste diário', 'ideia', 'Verificação automática diária do formulário', 'teste', v_seg)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    timeout_milliseconds := 20000);
  insert into privado.teste_formulario (req_pagina, req_config, req_envio) values (r1, r2, r3) returning id into novo;
  delete from privado.teste_formulario where id < novo - 60;
  return novo;
end;
$$;

create or replace function privado.teste_formulario_concluir()
returns jsonb language plpgsql security definer set search_path = public, privado as $$
declare
  t privado.teste_formulario;
  p record; c record; e record;
  e_pag jsonb; e_cfg jsonb; e_env jsonb;
  ok boolean;
  antes jsonb := (select data from registros where tabela = 'heartbeat' and id = 'formulario');
  res jsonb;
begin
  select * into t from privado.teste_formulario where not concluido order by id desc limit 1;
  if not found then return null; end if;
  select status_code, content, error_msg, timed_out into p from net._http_response where id = t.req_pagina;
  select status_code, content, error_msg, timed_out into c from net._http_response where id = t.req_config;
  select status_code, content, error_msg, timed_out into e from net._http_response where id = t.req_envio;

  e_pag := case
    when p.status_code is null then jsonb_build_object('ok', false, 'detalhe', 'Página não respondeu' || coalesce(' (' || p.error_msg || ')', ''))
    when p.status_code <> 200 then jsonb_build_object('ok', false, 'detalhe', 'Página respondeu HTTP ' || p.status_code)
    when p.content not like '%rpc/enviar_lead%' then jsonb_build_object('ok', false, 'detalhe', 'Página publicada sem o envio de respostas')
    else jsonb_build_object('ok', true, 'detalhe', 'Página no ar') end;
  e_cfg := case
    when c.status_code is null then jsonb_build_object('ok', false, 'detalhe', 'config.js não respondeu')
    when c.status_code <> 200 then jsonb_build_object('ok', false, 'detalhe', 'config.js respondeu HTTP ' || c.status_code)
    when c.content !~ 'supabaseUrl:\s*''https://[^'']+''' or c.content !~ 'supabaseAnonKey:\s*''[^'']+'''
      then jsonb_build_object('ok', false, 'detalhe', 'config.js sem as chaves do Supabase (as respostas não seriam salvas)')
    else jsonb_build_object('ok', true, 'detalhe', 'Configuração ok') end;
  e_env := case
    when e.status_code is null then jsonb_build_object('ok', false, 'detalhe', 'Envio não respondeu' || coalesce(' (' || e.error_msg || ')', ''))
    when e.status_code <> 200 or e.content not like '%teste-ok%'
      then jsonb_build_object('ok', false, 'detalhe', 'Envio falhou: HTTP ' || e.status_code || ' ' || left(coalesce(e.content, ''), 200))
    else jsonb_build_object('ok', true, 'detalhe', 'Resposta de teste aceita') end;

  ok := (e_pag->>'ok')::boolean and (e_cfg->>'ok')::boolean and (e_env->>'ok')::boolean;
  res := jsonb_build_object('at', t.iniciado_em, 'ok', ok,
    'etapas', jsonb_build_object('pagina', e_pag, 'config', e_cfg, 'envio', e_env),
    'ultimo_ok', case when ok then to_jsonb(t.iniciado_em) else antes->'ultimo_ok' end);
  insert into registros (tabela, id, data, updated_at) values ('heartbeat', 'formulario', res, now())
    on conflict (tabela, id) do update set data = excluded.data, updated_at = now();
  update privado.teste_formulario set concluido = true where id = t.id;
  return res;
end;
$$;

-- botão "Testar agora" na aba Status dos Sistemas (só administradores)
create or replace function public.testar_formulario_agora()
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'apenas administradores'; end if;
  return privado.teste_formulario_iniciar();
end;
$$;
create or replace function public.concluir_teste_formulario()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'apenas administradores'; end if;
  return privado.teste_formulario_concluir();
end;
$$;
revoke all on function public.testar_formulario_agora() from public, anon;
revoke all on function public.concluir_teste_formulario() from public, anon;
grant execute on function public.testar_formulario_agora() to authenticated;
grant execute on function public.concluir_teste_formulario() to authenticated;

-- agenda: 9h00 dispara o teste, 9h03 lê as respostas e grava o resultado (horário de Brasília = UTC-3)
select cron.unschedule(jobid) from cron.job where jobname in ('teste_formulario_iniciar', 'teste_formulario_concluir');
select cron.schedule('teste_formulario_iniciar', '0 12 * * *', 'select privado.teste_formulario_iniciar()');
select cron.schedule('teste_formulario_concluir', '3 12 * * *', 'select privado.teste_formulario_concluir()');
