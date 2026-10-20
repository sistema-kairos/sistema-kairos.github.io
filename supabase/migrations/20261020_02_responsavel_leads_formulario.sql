-- Leads do formulário caem para um responsável escolhido no CRM (registro config/crm_leads = { responsavel, email }).
-- Escolha inicial: Laura Puliti.

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
  -- responsável pelos leads do formulário, escolhido no CRM (registro config/crm_leads)
  dono text := (select nullif(trim(data->>'responsavel'), '') from registros where tabela = 'config' and id = 'crm_leads');
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
    'responsavel', dono,
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

insert into registros (tabela, id, data, updated_at)
values ('config', 'crm_leads', jsonb_build_object('responsavel', 'Laura Puliti', 'email', 'laura@orioncloudkitchens.com.br'), now())
on conflict (tabela, id) do nothing;
