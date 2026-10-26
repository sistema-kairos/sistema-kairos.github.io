-- Milestones dos clientes (aba CS → Milestones).
--   'milestones'        id = id do cliente (tabela comercial) → datas lançadas pelo CS:
--                         { pedidos_1000, faturado_1mm, novo_hub, super }  (AAAA-MM-DD)
--   'milestone_avisos'  id = '<cliente>|<marco>' → conquista já registrada:
--                         { cliente_id, marco, rotulo, data, loja, cliente, hub, historico, notificado_em, email, celebrado_em, celebrado_por }
-- Automáticos: dia da entrada, aniversários (1 ano, 2 anos…) e abertura em outro hub (mesmo CNPJ ou mesmo cliente em hub diferente).
-- privado.verificar_milestones() roda todo dia às 8h (e quando o CS lança uma data): registra as conquistas novas e avisa por e-mail
-- o CS e o gestor. Conquistas com mais de 7 dias quando entram no sistema ficam como histórico (sem e-mail), para não disparar o passado.

create or replace function public.area_da_tabela(t text)
returns text language sql immutable as $$
  select case t
    when 'comercial' then 'Comercial' when 'crm' then 'Comercial' when 'ind_comercial' then 'Comercial'
    when 'cs' then 'CS' when 'ind_cs' then 'CS' when 'milestones' then 'CS' when 'milestone_avisos' then 'CS'
    when 'leads' then 'MKT' when 'ind_mkt' then 'MKT' when 'visitas' then 'MKT' when 'form_sessoes' then 'MKT'
    when 'perfis' then 'admin' when 'margem' then 'admin'
    else 'geral' end
$$;

-- e-mail de milestones só é enviado depois que o Apps Script souber montar esse e-mail (ajuste 'milestones_email' = 'sim')
insert into privado.ajustes values ('milestones_email', 'nao') on conflict (chave) do nothing;

create or replace function privado.verificar_milestones(enviar boolean default true)
returns integer language plpgsql security definer set search_path = public, privado as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  linha record;
  novos jsonb := '[]'::jsonb;
  item jsonb;
  hist boolean;
  url text := (select valor from privado.ajustes where chave = 'email_webhook_url');
  ativo boolean := coalesce((select valor from privado.ajustes where chave = 'milestones_email'), 'nao') = 'sim';
  cfg jsonb := (select data from registros where tabela = 'config' and id = 'notificacoes');
  para jsonb;
begin
  for linha in
    with clientes as (
      select r.id, r.data d,
        case when coalesce(r.data->>'data_entrada_real', r.data->>'data_entrada_contrato') ~ '^\d{4}-\d{2}-\d{2}'
          then left(coalesce(r.data->>'data_entrada_real', r.data->>'data_entrada_contrato'), 10)::date end as entrada
      from registros r
      where r.tabela = 'comercial'
        -- quem já saiu (saída efetivada no CS) não recebe mais milestones
        and not exists (select 1 from registros s where s.tabela = 'cs'
          and lower(trim(s.data->>'loja')) = lower(trim(r.data->>'nome_loja'))
          and coalesce(s.data->>'data_saida_prevista', '') <> '' and s.data->>'data_saida_prevista' <= to_char(hoje, 'YYYY-MM-DD'))
    ), cand as (
      select id, 'entrada' as marco, 'Começou a operar na Órion' as rotulo, entrada as data from clientes where entrada is not null
      union all
      select c.id, 'ano_' || g, case when g = 1 then '1 ano de Órion' else g || ' anos de Órion' end, (c.entrada + make_interval(years => g))::date
        from clientes c cross join generate_series(1, 30) g
        where c.entrada is not null and (c.entrada + make_interval(years => g))::date <= hoje
      union all
      select c.id, k.marco, k.rotulo, left(m.data->>k.marco, 10)::date
        from clientes c join registros m on m.tabela = 'milestones' and m.id = c.id
        cross join (values ('pedidos_1000', 'Primeiros 1.000 pedidos'), ('faturado_1mm', 'R$ 1 milhão faturado'),
                           ('novo_hub', 'Abertura em um novo hub'), ('super', 'Atingiu a marca Super')) k(marco, rotulo)
        where m.data->>k.marco ~ '^\d{4}-\d{2}-\d{2}'
      union all
      -- abertura em outro hub, automática: mesmo CNPJ (ou mesmo nome de cliente) com entrada posterior em hub diferente
      select c.id, 'novo_hub', 'Abertura em um novo hub', min(o.entrada)
        from clientes c join clientes o on o.id <> c.id and o.entrada > c.entrada
          and coalesce(o.d->>'hub', '') <> coalesce(c.d->>'hub', '')
          and ((nullif(regexp_replace(coalesce(c.d->>'cnpj', ''), '\D', '', 'g'), '') = nullif(regexp_replace(coalesce(o.d->>'cnpj', ''), '\D', '', 'g'), ''))
            or (nullif(lower(trim(c.d->>'nome_cliente')), '') = nullif(lower(trim(o.d->>'nome_cliente')), '')))
        group by c.id
    )
    select distinct on (cand.id, cand.marco) cand.id, cand.marco, cand.rotulo, cand.data, cl.d
      from cand join clientes cl on cl.id = cand.id
      where cand.data is not null and cand.data <= hoje
        and not exists (select 1 from registros a where a.tabela = 'milestone_avisos' and a.id = cand.id || '|' || cand.marco)
      order by cand.id, cand.marco, cand.data
  loop
    hist := linha.data < hoje - 7;
    item := jsonb_strip_nulls(jsonb_build_object(
      'cliente_id', linha.id, 'marco', linha.marco, 'rotulo', linha.rotulo, 'data', to_char(linha.data, 'YYYY-MM-DD'),
      'loja', linha.d->>'nome_loja', 'cliente', linha.d->>'nome_cliente', 'hub', linha.d->>'hub',
      'historico', hist, 'notificado_em', now(), 'email', (not hist and enviar and ativo and url is not null)));
    insert into registros (tabela, id, data, updated_at) values ('milestone_avisos', linha.id || '|' || linha.marco, item, now())
      on conflict (tabela, id) do nothing;
    if not hist then novos := novos || item; end if;
  end loop;

  if jsonb_array_length(novos) > 0 and enviar and ativo and url is not null then
    -- destinatários: lista de Configurações; sem lista, todo o CS e os administradores
    para := case when jsonb_typeof(cfg->'emails_milestones') = 'array' and jsonb_array_length(cfg->'emails_milestones') > 0
      then cfg->'emails_milestones'
      else coalesce((select jsonb_agg(id) from registros where tabela = 'perfis' and (data->>'papel' = 'Administrador' or data->>'area' = 'CS')), '[]'::jsonb) end;
    if jsonb_array_length(para) > 0 then
      perform net.http_post(url := url,
        body := jsonb_build_object('tipo', 'milestone', 'para', para, 'itens', novos,
                                   'link', coalesce(cfg->>'site_url', '') || 'cs-milestones.html'),
        timeout_milliseconds := 10000);
    end if;
  end if;
  return jsonb_array_length(novos);
end;
$$;

-- botão/salvamento na tela: quem pode lançar milestones (CS e administradores) dispara a verificação na hora
create or replace function public.verificar_milestones_agora()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not pode_escrever('milestones') then raise exception 'sem permissão'; end if;
  return privado.verificar_milestones(true);
end;
$$;
revoke all on function public.verificar_milestones_agora() from public, anon;
grant execute on function public.verificar_milestones_agora() to authenticated;

-- todo dia às 8h (horário de Brasília = 11:00 UTC)
select cron.unschedule(jobid) from cron.job where jobname = 'verificar_milestones';
select cron.schedule('verificar_milestones', '0 11 * * *', 'select privado.verificar_milestones(true)');

-- primeira verificação: registra o que já aconteceu (o que tem mais de 7 dias fica como histórico)
select privado.verificar_milestones(true);
