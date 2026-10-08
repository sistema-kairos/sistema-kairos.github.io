-- Calculadora de margem: tabela 'margem' é exclusiva dos administradores (leitura e escrita)
create or replace function public.area_da_tabela(t text)
returns text language sql immutable as $$
  select case t
    when 'comercial' then 'Comercial' when 'crm' then 'Comercial' when 'ind_comercial' then 'Comercial'
    when 'cs' then 'CS' when 'ind_cs' then 'CS'
    when 'leads' then 'MKT' when 'ind_mkt' then 'MKT'
    when 'perfis' then 'admin' when 'margem' then 'admin'
    else 'geral' end
$$;
