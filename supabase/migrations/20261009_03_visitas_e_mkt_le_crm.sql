-- Indicadores de MKT: contador de visitantes do formulário e leitura do CRM pelo Marketing.

-- tabela 'visitas' pertence ao MKT
create or replace function public.area_da_tabela(t text)
returns text language sql immutable as $$
  select case t
    when 'comercial' then 'Comercial' when 'crm' then 'Comercial' when 'ind_comercial' then 'Comercial'
    when 'cs' then 'CS' when 'ind_cs' then 'CS'
    when 'leads' then 'MKT' when 'ind_mkt' then 'MKT' when 'visitas' then 'MKT'
    when 'perfis' then 'admin' when 'margem' then 'admin'
    else 'geral' end
$$;

-- Marketing consulta (sem editar) o CRM: leads por canal, vendas, conversão, CPA e retorno
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
