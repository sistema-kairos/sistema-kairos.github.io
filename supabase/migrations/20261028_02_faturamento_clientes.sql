-- CS → Faturamento dos clientes: integração com a planilha "Faturamento Mensal" (Google Drive).
--   'cs_faturamento'   id = 'AAAA-MM' (mês da aba "Cobrança MM/AAAA") → { mes, aba, linhas: [...], importado_em }
--   'cs_clientes'      id = nome do cliente normalizado → { cliente, espaco }  (espaço ocupado, lançado pelo CS)
--   'cs_faturamento_status' id = 'ultimo' → { em, abas, linhas, origem }
-- Como funciona: o banco pede a importação ao Apps Script (o mesmo dos e-mails), que lê a planilha
-- e devolve as abas pela função importar_faturamento, usando um código de uso único que vale 30 minutos.
-- Automático nos dias 3 e 16 de cada mês às 9h (clientes com fechamento no dia 02 e no dia 15) e pelo botão "Importar agora".

create or replace function public.area_da_tabela(t text)
returns text language sql immutable as $$
  select case t
    when 'comercial' then 'Comercial' when 'crm' then 'Comercial' when 'ind_comercial' then 'Comercial'
    when 'cs' then 'CS' when 'ind_cs' then 'CS' when 'milestones' then 'CS' when 'milestone_avisos' then 'CS'
    when 'cs_rotina' then 'CS' when 'cs_semana' then 'CS'
    when 'cs_faturamento' then 'CS' when 'cs_clientes' then 'CS' when 'cs_faturamento_status' then 'CS'
    when 'leads' then 'MKT' when 'ind_mkt' then 'MKT' when 'visitas' then 'MKT' when 'form_sessoes' then 'MKT'
    when 'perfis' then 'admin' when 'margem' then 'admin'
    else 'geral' end
$$;

-- pede a leitura da planilha ao Apps Script; devolve false se o endereço do Apps Script não estiver configurado
create or replace function privado.pedir_faturamento(origem text)
returns boolean language plpgsql security definer set search_path = public, privado as $$
declare
  url text := (select valor from privado.ajustes where chave = 'email_webhook_url');
  codigo text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if url is null then return false; end if;
  insert into privado.ajustes values ('faturamento_codigo', codigo || '|' || extract(epoch from now() + interval '30 minutes')::bigint || '|' || origem)
    on conflict (chave) do update set valor = excluded.valor;
  perform net.http_post(url := url,
    body := jsonb_build_object('tipo', 'importar_faturamento', 'codigo', codigo),
    timeout_milliseconds := 10000);
  return true;
end;
$$;

-- botão "Importar agora" (CS e administradores)
create or replace function public.importar_faturamento_agora()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not pode_escrever('cs_faturamento') then raise exception 'sem permissão'; end if;
  return privado.pedir_faturamento('manual: ' || coalesce(auth.jwt()->>'email', ''));
end;
$$;
revoke all on function public.importar_faturamento_agora() from public, anon;
grant execute on function public.importar_faturamento_agora() to authenticated;

-- chamada pelo Apps Script com as abas lidas da planilha (sem login, só com o código de uso único)
create or replace function public.importar_faturamento(codigo text, abas jsonb, fim boolean default true)
returns integer language plpgsql security definer set search_path = public, privado as $$
declare
  salvo text[] := string_to_array((select valor from privado.ajustes where chave = 'faturamento_codigo'), '|');
  aba jsonb;
  n integer := 0;
  linhas integer := 0;
begin
  if salvo is null or coalesce(codigo, '') = '' or salvo[1] <> codigo or salvo[2]::bigint < extract(epoch from now()) then
    raise exception 'código inválido ou vencido';
  end if;
  if jsonb_typeof(abas) <> 'array' or jsonb_array_length(abas) > 40 then raise exception 'formato inválido'; end if;
  for aba in select * from jsonb_array_elements(abas) loop
    if coalesce(aba->>'mes', '') !~ '^\d{4}-\d{2}$' or jsonb_typeof(aba->'linhas') <> 'array' or jsonb_array_length(aba->'linhas') > 400 then
      raise exception 'aba inválida: %', left(coalesce(aba->>'aba', '?'), 60);
    end if;
    insert into registros (tabela, id, data, updated_at)
    values ('cs_faturamento', aba->>'mes', jsonb_build_object('mes', aba->>'mes', 'aba', left(aba->>'aba', 80),
            'linhas', aba->'linhas', 'importado_em', now()), now())
    on conflict (tabela, id) do update set data = excluded.data, updated_at = now();
    n := n + 1;
    linhas := linhas + jsonb_array_length(aba->'linhas');
  end loop;
  insert into registros (tabela, id, data, updated_at)
  values ('cs_faturamento_status', 'ultimo', jsonb_build_object('em', now(), 'abas', n, 'linhas', linhas, 'origem', salvo[3]), now())
  on conflict (tabela, id) do update set data = excluded.data, updated_at = now();
  if fim then delete from privado.ajustes where chave = 'faturamento_codigo'; end if;
  return n;
end;
$$;
revoke all on function public.importar_faturamento(text, jsonb, boolean) from public;
grant execute on function public.importar_faturamento(text, jsonb, boolean) to anon, authenticated;

-- dias 3 e 16 de cada mês, às 9h (horário de Brasília = 12:00 UTC)
select cron.unschedule(jobid) from cron.job where jobname = 'importar_faturamento';
select cron.schedule('importar_faturamento', '0 12 3,16 * *', $$select privado.pedir_faturamento('automático')$$);
