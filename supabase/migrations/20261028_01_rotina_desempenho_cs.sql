-- CS: Rotina do dia, Registro semanal e Desempenho.
--   'cs_rotina'  id = '<e-mail>|<AAAA-MM-DD>'       → { usuario, nome, data, feitos: { <bloco>: true }, obs }
--   'cs_semana'  id = '<e-mail>|<segunda AAAA-MM-DD>' → { usuario, nome, semana, campos do registro semanal (estagio.js) }
-- As duas tabelas são da área CS: quem é do CS lança; espectadores e administradores consultam.

create or replace function public.area_da_tabela(t text)
returns text language sql immutable as $$
  select case t
    when 'comercial' then 'Comercial' when 'crm' then 'Comercial' when 'ind_comercial' then 'Comercial'
    when 'cs' then 'CS' when 'ind_cs' then 'CS' when 'milestones' then 'CS' when 'milestone_avisos' then 'CS'
    when 'cs_rotina' then 'CS' when 'cs_semana' then 'CS'
    when 'leads' then 'MKT' when 'ind_mkt' then 'MKT' when 'visitas' then 'MKT' when 'form_sessoes' then 'MKT'
    when 'perfis' then 'admin' when 'margem' then 'admin'
    else 'geral' end
$$;
