// Definição dos campos de cada cadastro. Para adicionar/alterar colunas, edite aqui.
// type: text | textarea | money | percent | int | date | datetime | month | select | email | tel | cnpj | months
// list: aparece na tabela | suggest: sugere valores já usados | aliases: nomes alternativos na importação

const COMERCIAL_FIELDS = [
  { key: 'nome_cliente', label: 'Nome Cliente', type: 'text', required: true, list: true },
  { key: 'nome_loja', label: 'Nome da Loja', type: 'text', required: true, list: true },
  { key: 'modelo', label: 'Modelo', type: 'text', suggest: true, list: true },
  { key: 'espaco_ocupado', label: 'Espaço Ocupado', type: 'text', suggest: true, list: true },
  { key: 'mensalidade_fixa', label: 'Mensalidade Fixa', type: 'money', list: true },
  { key: 'taxa_variavel_pct', label: 'Taxa Variável (%)', type: 'percent', list: true, forced: r => isDK(r.modelo) ? 0 : undefined, hint: 'Modelo DK: sempre 0%.' },
  { key: 'taxa_variavel_rs', label: 'Taxa Variável (R$)', type: 'money', list: true, hint: 'Modelo DK: digite o valor mensal da taxa variável.' },
  { key: 'data_entrada_contrato', label: 'Início previsto (Contrato)', type: 'date', list: true, aliases: ['Data de Entrada (Contrato)'] },
  { key: 'data_entrada_real', label: 'Início real', type: 'date', list: true, aliases: ['Data de Entrada (Real)'] },
  { key: 'cnpj', label: 'CNPJ', type: 'cnpj' },
  { key: 'data_primeiro_pagamento', label: 'Data do 1º pagamento', type: 'date', aliases: ['Data do 1o pagamento', 'Data do primeiro pagamento'] },
  { key: 'valor_primeira_mensalidade', label: 'Valor da 1ª mensalidade', type: 'money', aliases: ['Valor da 1a mensalidade', 'Valor da primeira mensalidade'] },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'telefone', label: 'Telefone', type: 'tel' },
  { key: 'icp', label: 'ICP', type: 'select', options: ['Sim', 'Não'] },
  { key: 'novo_espaco_upsell', label: 'Novo Espaço (Upsell)', type: 'text' },
  { key: 'hub', label: 'Hub', type: 'select', options: HUBS, required: true, list: true },
  { key: 'mes_fechamento', label: 'Mês de Fechamento', type: 'month', list: true },
  { key: 'observacoes', label: 'Observações', type: 'textarea' },
];

const REUNIAO_AP = ['Pendente', 'Agendada', 'Realizada', 'Não realizada'];

const CS_FIELDS = [
  { key: 'loja', label: 'Loja', type: 'text', required: true, list: true, hint: 'Ao escolher uma loja do Comercial, os dados são preenchidos automaticamente.' },
  { key: 'nome_cliente', label: 'Nome do Cliente', type: 'text', list: true },
  { key: 'hub', label: 'Hub', type: 'select', options: HUBS, list: true },
  { key: 'modelo', label: 'Modelo', type: 'text', suggest: true },
  { key: 'faturamento_medio', label: 'Faturamento mensal médio', type: 'money', list: true },
  { key: 'mensalidade_fixa', label: 'Mensalidade Fixa', type: 'money', list: true },
  { key: 'taxa_variavel', label: 'Taxa Variável (%)', type: 'percent', aliases: ['Taxa Variável'], forced: r => isDK(r.modelo) ? 0 : undefined, hint: 'Modelo DK: sempre 0%.' },
  { key: 'taxa_variavel_rs', label: 'Taxa Variável (R$)', type: 'money', hint: 'Modelo DK: valor mensal da taxa variável (vem do Comercial, pode ser editado).' },
  { key: 'espaco', label: 'Espaço', type: 'text', suggest: true },
  { key: 'aviso_previo_dias', label: 'Tempo de aviso prévio (Dias)', type: 'int', default: 30 },
  { key: 'data_solicitacao', label: 'Data de solicitação', type: 'date', list: true },
  { key: 'data_entrada_contrato', label: 'Início previsto (Contrato)', type: 'date', aliases: ['Data de Entrada (Contrato)'] },
  { key: 'data_entrada_real', label: 'Início real', type: 'date', aliases: ['Data de Entrada (Real)'] },
  {
    key: 'data_inicio', label: 'Data de Início', type: 'date',
    deps: ['data_entrada_real', 'data_entrada_contrato'],
    compute: r => r.data_entrada_real || r.data_entrada_contrato || r.data_inicio,
    hint: 'Usa o início real (ou o previsto em contrato, se ainda não houver). Pode ser ajustada.',
  },
  {
    key: 'data_saida_prevista', label: 'Data de Saída Prevista', type: 'date', list: true,
    deps: ['data_solicitacao', 'aviso_previo_dias'],
    compute: r => r.data_solicitacao && !isBlank(r.aviso_previo_dias) ? dates.addDays(r.data_solicitacao, r.aviso_previo_dias) : r.data_saida_prevista,
    hint: 'Calculada: solicitação + aviso prévio (pode ser ajustada).',
  },
  {
    key: 'tempo_vida', label: 'Tempo de Vida', type: 'months', readonly: true, list: true,
    deps: ['data_inicio', 'data_saida_prevista'],
    compute: r => r.data_inicio && r.data_saida_prevista ? dates.monthsBetween(r.data_inicio, r.data_saida_prevista) : null,
    hint: 'Calculado em meses: início → saída prevista.',
  },
  { key: 'reuniao_ap', label: 'Reunião de A.P', type: 'select', options: REUNIAO_AP, default: 'Pendente', list: true, aliases: ['Reunião de AP', 'Reuniao A.P'] },
  { key: 'observacoes', label: 'Observações', type: 'textarea' },
];

// Respostas do formulário público (formulario.html), gravadas pela função enviar_lead do Supabase
const LEAD_STATUS = ['Novo', 'Em contato', 'Qualificado', 'Convertido', 'Descartado'];

const LEADS_FIELDS = [
  { key: 'nome', label: 'Nome', type: 'text', required: true, list: true },
  { key: 'recebido_em', label: 'Recebido em', type: 'datetime', list: true },
  { key: 'status', label: 'Status', type: 'select', options: LEAD_STATUS, default: 'Novo', list: true },
  { key: 'telefone', label: 'Telefone', type: 'tel', list: true },
  { key: 'email', label: 'E-mail', type: 'email', list: true },
  { key: 'nome_loja', label: 'Loja / empresa', type: 'text', list: true },
  { key: 'situacao_delivery', label: 'Delivery hoje', type: 'select', options: ['Já vendo por delivery', 'Parei com o delivery', 'Nunca vendi'], list: true },
  { key: 'vende_apps', label: 'Vende em apps', type: 'select', options: ['Sim, vendo nos apps', 'Não vendo por apps'], list: true },
  { key: 'pedidos_mes', label: 'Pedidos/mês', type: 'select', options: ['Mais de 400 pedidos', 'De 150 a 400', 'De 60 a 150', 'Menos de 60'], list: true },
  { key: 'prazo_inicio', label: 'Quer começar', type: 'select', options: ['Imediatamente', 'Entre 1 e 3 meses', 'Acima de 3 meses'], list: true },
  { key: 'ideia', label: 'Ideia de negócio', type: 'textarea' },
  { key: 'observacoes', label: 'Observações internas', type: 'textarea' },
  { key: 'utm_source', label: 'Origem (utm_source)', type: 'text' },
  { key: 'utm_medium', label: 'Mídia (utm_medium)', type: 'text' },
  { key: 'utm_campaign', label: 'Campanha (utm_campaign)', type: 'text' },
];
