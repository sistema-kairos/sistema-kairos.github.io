-- Funil do formulário de leads: em que pergunta cada visitante parou (sem dados pessoais).
-- Registro 'form_sessoes' id = sessão (uma por abertura da página) →
--   { inicio, dia, atualizado, vistas: [chaves das perguntas vistas], ultima, enviado, respostas: {qualificação}, utm_source, utm_campaign, dispositivo }
-- Nome, telefone, e-mail, loja e ideia NUNCA são gravados aqui: só quais perguntas a pessoa viu e as opções de qualificação escolhidas.

create or replace function public.area_da_tabela(t text)
returns text language sql immutable as $$
  select case t
    when 'comercial' then 'Comercial' when 'crm' then 'Comercial' when 'ind_comercial' then 'Comercial'
    when 'cs' then 'CS' when 'ind_cs' then 'CS'
    when 'leads' then 'MKT' when 'ind_mkt' then 'MKT' when 'visitas' then 'MKT' when 'form_sessoes' then 'MKT'
    when 'perfis' then 'admin' when 'margem' then 'admin'
    else 'geral' end
$$;

create or replace function public.registrar_etapa(sessao text, dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  etapas text[] := array['nome', 'telefone', 'email', 'situacao_delivery', 'vende_apps', 'pedidos_mes', 'nome_loja', 'prazo_inicio', 'ideia', 'enviado'];
  escolhas text[] := array['situacao_delivery', 'vende_apps', 'pedidos_mes', 'prazo_inicio'];
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
