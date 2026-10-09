-- Teste diário do formulário de leads (Status dos Sistemas), todo dia às 9h (12:00 UTC).
-- 1) baixa a página publicada e o config.js; 2) envia uma resposta de teste pela mesma API do formulário.
-- A resposta de teste passa por toda a validação e é gravada e desfeita na mesma hora: não entra em Leads nem no CRM.
-- O resultado fica em registros (tabela 'heartbeat', id 'formulario').
-- Endereços usados (privado.ajustes): site_url, supabase_url, supabase_anon_key e teste_formulario_segredo.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

insert into privado.ajustes values ('teste_formulario_segredo', md5(random()::text || clock_timestamp()::text) || md5(random()::text))
  on conflict (chave) do nothing;

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
