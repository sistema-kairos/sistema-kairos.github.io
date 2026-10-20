-- Formulário com páginas de valor: a pessoa escolhe o objetivo dela com o delivery (vai para o lead e para o CRM)
-- e o funil passa a medir também as duas páginas iniciais ('intro' e 'objetivo').

create or replace function public.enviar_lead(dados jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_id text := gen_random_uuid()::text;
  crm_id text := gen_random_uuid()::text;
  campos text[] := array['nome', 'telefone', 'email', 'objetivo', 'situacao_delivery', 'vende_apps', 'pedidos_mes',
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
    'objetivo', limpo->>'objetivo',
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

create or replace function public.registrar_etapa(sessao text, dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  etapas text[] := array['intro', 'objetivo', 'nome', 'telefone', 'email', 'situacao_delivery', 'vende_apps', 'pedidos_mes', 'nome_loja', 'prazo_inicio', 'ideia', 'enviado'];
  escolhas text[] := array['objetivo', 'situacao_delivery', 'vende_apps', 'pedidos_mes', 'prazo_inicio'];
  etapa text := dados->>'etapa';
  atual jsonb;
  resp jsonb := '{}'::jsonb;
  c text;
  novo jsonb;
begin
  if sessao !~ '^[0-9a-f-]{36}$' then raise exception 'sessão inválida'; end if;
  if etapa is null or not (etapa = any(etapas)) then raise exception 'etapa inválida'; end if;
  foreach c in array escolhas loop
    if jsonb_typeof(dados->'respostas'->c) = 'string' then resp := resp || jsonb_build_object(c, left(dados->'respostas'->>c, 60)); end if;
  end loop;
  select data into atual from registros where tabela = 'form_sessoes' and id = sessao;
  if atual is null then
    novo := jsonb_strip_nulls(jsonb_build_object(
      'inicio', now(), 'dia', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'), 'atualizado', now(),
      'vistas', jsonb_build_array(etapa), 'ultima', etapa, 'enviado', etapa = 'enviado', 'respostas', resp,
      'utm_source', left(dados->>'utm_source', 100), 'utm_campaign', left(dados->>'utm_campaign', 100),
      'dispositivo', case when dados->>'dispositivo' in ('celular', 'computador') then dados->>'dispositivo' end));
    insert into registros (tabela, id, data, updated_at) values ('form_sessoes', sessao, novo, now());
  else
    -- sessão antiga (mais de 6 horas) não é mais alterada
    if (atual->>'inicio')::timestamptz < now() - interval '6 hours' then return; end if;
    novo := atual || jsonb_build_object(
      'atualizado', now(),
      'vistas', case when atual->'vistas' ? etapa then atual->'vistas' else coalesce(atual->'vistas', '[]'::jsonb) || to_jsonb(etapa) end,
      'ultima', etapa,
      'enviado', coalesce((atual->>'enviado')::boolean, false) or etapa = 'enviado',
      'respostas', coalesce(atual->'respostas', '{}'::jsonb) || resp);
    update registros set data = novo, updated_at = now() where tabela = 'form_sessoes' and id = sessao;
  end if;
end;
$$;
revoke all on function public.registrar_etapa(text, jsonb) from public;
grant execute on function public.registrar_etapa(text, jsonb) to anon, authenticated;
