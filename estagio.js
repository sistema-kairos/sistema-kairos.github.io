// Rotina, registro semanal e indicadores do CS (estágio).
//   'cs_rotina'  id = '<e-mail>|<AAAA-MM-DD>'       → { usuario, nome, data, feitos: { <bloco>: true }, obs }
//   'cs_semana'  id = '<e-mail>|<segunda AAAA-MM-DD>' → { usuario, nome, semana, ...campos de CAMPOS_SEMANA }
// Metas e textos ficam aqui para ajustar sem mexer nas telas.
const Estagio = (() => {
  const email = () => (Store.getSession()?.email || 'local').toLowerCase();
  const nome = () => Store.perfil().nome || Store.getSession()?.email || 'Modo local';

  // ---------- semanas (segunda a sexta) ----------
  const segundaDe = iso => { const d = dates.toDate(iso); return dates.addDays(iso, -((d.getDay() + 6) % 7)); };
  const diasUteis = seg => [0, 1, 2, 3, 4].map(i => dates.addDays(seg, i));
  const semanaTxt = seg => `${fmt.date(seg).slice(0, 5)} a ${fmt.date(dates.addDays(seg, 4)).slice(0, 5)}`;

  // ---------- rotina do dia (13h às 19h) ----------
  const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  function blocoDoDia(iso) {
    const d = dates.toDate(iso), dia = d.getDate();
    switch (d.getDay()) {
      case 1: return { titulo: 'Notícias e planejamento', desc: 'Enviar o comunicado semanal de notícias e dividir os clientes entre os dias da semana.', ind: 'E' };
      case 2: return { titulo: 'Hub', desc: 'Boas práticas, primeiro abastecimento e onboarding presencial.', ind: 'J' };
      case 3: return dia <= 14
        ? { titulo: 'Análises de ruptura', desc: 'Semanas 1 e 2 do mês: fazer e enviar as análises de ruptura.', ind: 'F' }
        : { titulo: 'Upsell e NPS', desc: 'Revisar as oportunidades de upsell e, em mês de NPS, cobrar as respostas.', ind: 'L, K' };
      case 4: return { titulo: 'Hub ou ruptura', desc: 'Visita ao hub ou análises de ruptura pendentes.', ind: 'F, J' };
      case 5: return dia <= 7
        ? { titulo: 'Queda de vendas do mês', desc: 'Levantar os clientes com queda acima de 20% no mês e contatar cada um.', ind: 'P, Q' }
        : { titulo: 'Revisão da carteira', desc: 'Revisar a carteira e preparar a semana seguinte.', ind: '' };
      default: return null;
    }
  }
  function rotina(iso) {
    const dow = dates.toDate(iso).getDay();
    if (dow === 0 || dow === 6) return [];
    const b = blocoDoDia(iso);
    return [
      { id: 'abertura', ini: '13:00', fim: '13:30', titulo: 'Abertura', desc: 'Pendências no ChatPro, novos avisos prévios (marcar a reunião de retenção) e etapas de onboarding do dia.', ind: 'G, T, J' },
      { id: 'abastecimento', ini: '13:30', fim: '14:15', titulo: 'Checagem de abastecimento', desc: 'Sinalizar os clientes com produtos pausados, sem abastecer há mais de 1 semana ou com estoque abaixo de 70% e enviar a cobrança.', ind: 'A, B' },
      { id: 'performance', ini: '14:15', fim: '16:15', titulo: 'Bloco de performance', desc: '10 clientes do dia: analisar as vendas, escolher 1 ponto de melhoria e enviar a recomendação. Anotar as oportunidades de upsell.', ind: 'C, L' },
      { id: 'bloco', ini: '16:15', fim: '17:30', ...b },
      { id: 'acompanhamento', ini: '17:30', fim: '18:30', titulo: 'Acompanhamento', desc: 'Conferir se os clientes aplicaram as recomendações da semana anterior e retornar as demandas em aberto.', ind: 'D, G' },
      dow === 5
        ? { id: 'fechamento', ini: '18:30', fim: '19:00', titulo: 'Fechamento e registro semanal', desc: 'Zerar as pendências, registrar os erros de pedido e lançar no Registro semanal todas as ações da semana.', ind: 'G, I' }
        : { id: 'fechamento', ini: '18:30', fim: '19:00', titulo: 'Fechamento', desc: 'Zerar as pendências do dia e registrar os erros de pedido no sistema.', ind: 'G, I' },
    ];
  }
  const REGRAS = [
    'O ChatPro fica aberto o tempo todo: a primeira resposta sai em até 15 minutos, mesmo durante os blocos.',
    'Demandas sem terceiros são resolvidas em até 3 horas; com terceiros, em até 24 horas.',
  ];

  // ---------- registro semanal ----------
  // tipo: int | money | min | sim; auto: preenchido a partir de outras abas quando o campo está vazio
  const CAMPOS_SEMANA = [
    { grupo: 'Rotina e ações', campos: [
      { key: 'dias_checagem', label: 'Dias com checagem de abastecimento (0 a 5)', tipo: 'int', ind: 'A' },
      { key: 'sinalizados', label: 'Clientes sinalizados na checagem', tipo: 'int', ind: 'B' },
      { key: 'sinalizados_contatados', label: 'Sinalizados contatados no mesmo dia', tipo: 'int', ind: 'B' },
      { key: 'base_clientes', label: 'Clientes ativos na carteira', tipo: 'int', ind: 'C, F, K' },
      { key: 'contatos_performance', label: 'Clientes com contato de performance', tipo: 'int', ind: 'C' },
      { key: 'recomendacoes_enviadas', label: 'Recomendações enviadas na semana anterior', tipo: 'int', ind: 'D' },
      { key: 'recomendacoes_aplicadas', label: 'Dessas, quantas o cliente aplicou', tipo: 'int', ind: 'D' },
      { key: 'comunicado', label: 'Comunicado de notícias enviado', tipo: 'sim', ind: 'E' },
      { key: 'rupturas_mes', label: 'Análises de ruptura enviadas no mês (acumulado)', tipo: 'int', ind: 'F' },
      { key: 'demandas_total', label: 'Demandas recebidas', tipo: 'int', ind: 'G' },
      { key: 'demandas_prazo', label: 'Demandas resolvidas no prazo', tipo: 'int', ind: 'G' },
      { key: 'tempo_resposta', label: 'Tempo médio da primeira resposta (minutos)', tipo: 'min', ind: 'H' },
      { key: 'erros_ocorridos', label: 'Erros de pedido ocorridos', tipo: 'int', ind: 'I' },
      { key: 'erros_registrados', label: 'Erros de pedido registrados no sistema', tipo: 'int', ind: 'I' },
      { key: 'onb_previstas', label: 'Etapas de onboarding previstas', tipo: 'int', ind: 'J' },
      { key: 'onb_prazo', label: 'Etapas de onboarding feitas no prazo', tipo: 'int', ind: 'J' },
      { key: 'nps_respostas', label: 'Respostas do NPS no trimestre (acumulado)', tipo: 'int', ind: 'K' },
      { key: 'upsell', label: 'Oportunidades de upsell identificadas', tipo: 'int', ind: 'L' },
    ] },
    { grupo: 'Vendas dos clientes', campos: [
      { key: 'faturamento', label: 'Faturamento da carteira na semana (R$)', tipo: 'money', ind: 'M, N, O' },
      { key: 'pedidos', label: 'Pedidos da carteira na semana', tipo: 'int', ind: 'M, O' },
      { key: 'queda_clientes', label: 'Clientes com queda acima de 20% no mês (1ª semana do mês)', tipo: 'int', ind: 'P' },
      { key: 'queda_contatados', label: 'Clientes em queda contatados', tipo: 'int', ind: 'Q' },
    ] },
    { grupo: 'Churn e aviso prévio', campos: [
      { key: 'churn_clientes', label: 'Clientes que saíram na semana', tipo: 'int', ind: 'R', auto: true },
      { key: 'churn_mensalidade', label: 'Mensalidade perdida na semana (R$)', tipo: 'money', ind: 'R', auto: true },
      { key: 'avisos_novos', label: 'Novos avisos prévios na semana', tipo: 'int', ind: 'S, T', auto: true },
      { key: 'avisos_andamento', label: 'Avisos prévios em andamento', tipo: 'int', ind: 'S', auto: true },
      { key: 'reunioes_prazo', label: 'Reuniões de retenção marcadas em até 2 dias úteis', tipo: 'int', ind: 'T' },
      { key: 'avisos_com_reuniao', label: 'Avisos com reunião de retenção feita', tipo: 'int', ind: 'U' },
      { key: 'avisos_revertidos', label: 'Avisos revertidos', tipo: 'int', ind: 'U' },
    ] },
  ];
  const CAMPOS = CAMPOS_SEMANA.flatMap(g => g.campos);

  // valores calculados das abas CS (solicitações de saída) para a semana
  function autoCS(cs, seg) {
    const fim = dates.addDays(seg, 6), em = d => d && d >= seg && d <= fim;
    const saidas = cs.filter(r => em(r.data_saida_prevista));
    return {
      churn_clientes: saidas.length,
      churn_mensalidade: saidas.reduce((s, r) => s + (Number(r.mensalidade_fixa) || 0), 0),
      avisos_novos: cs.filter(r => em(r.data_solicitacao)).length,
      avisos_andamento: cs.filter(r => r.data_solicitacao && r.data_solicitacao <= fim && (!r.data_saida_prevista || r.data_saida_prevista > fim)).length,
    };
  }

  // ---------- indicadores ----------
  const n = v => isBlank(v) ? null : Number(v);
  const razao = (a, b) => (n(a) === null || !n(b)) ? null : n(a) / n(b) * 100;
  // meta: { op: '>=' | '<=', v } → status ok/alerta; sem meta = acompanhamento
  // r = registro da semana; ctx = { anterior, mes: registros do mesmo mês até a semana }
  const INDICADORES = [
    { id: 'A', grupo: 'Rotina e ações', nome: 'Checagem diária de abastecimento', un: 'dias', calc: r => n(r.dias_checagem), meta: { op: '>=', v: 5 }, metaTxt: '5 de 5 dias' },
    { id: 'B', grupo: 'Rotina e ações', nome: 'Sinalizados contatados no mesmo dia', un: '%', calc: r => razao(r.sinalizados_contatados, r.sinalizados), meta: { op: '>=', v: 100 }, metaTxt: '100%' },
    { id: 'C', grupo: 'Rotina e ações', nome: 'Contatos de performance', un: '%', calc: r => razao(r.contatos_performance, r.base_clientes), meta: { op: '>=', v: 100 }, metaTxt: '100% da carteira' },
    { id: 'D', grupo: 'Rotina e ações', nome: 'Recomendações aplicadas pelo cliente', un: '%', calc: r => razao(r.recomendacoes_aplicadas, r.recomendacoes_enviadas), meta: { op: '>=', v: 40 }, metaTxt: '40% ou mais' },
    { id: 'E', grupo: 'Rotina e ações', nome: 'Comunicado de notícias', un: 'sim', calc: r => isBlank(r.comunicado) ? null : (r.comunicado === 'Sim' ? 1 : 0), meta: { op: '>=', v: 1 }, metaTxt: '1 por semana' },
    { id: 'F', grupo: 'Rotina e ações', nome: 'Análises de ruptura enviadas no mês', un: '%', calc: r => razao(r.rupturas_mes, r.base_clientes), meta: { op: '>=', v: 100, aPartirDoDia: 10 }, metaTxt: '100% até o dia 10' },
    { id: 'G', grupo: 'Rotina e ações', nome: 'Demandas resolvidas no prazo', un: '%', calc: r => razao(r.demandas_prazo, r.demandas_total), meta: { op: '>=', v: 90 }, metaTxt: '90% ou mais' },
    { id: 'H', grupo: 'Rotina e ações', nome: 'Tempo médio da primeira resposta', un: 'min', calc: r => n(r.tempo_resposta), meta: { op: '<=', v: 15 }, metaTxt: 'até 15 min' },
    { id: 'I', grupo: 'Rotina e ações', nome: 'Erros de pedido registrados', un: '%', calc: r => razao(r.erros_registrados, r.erros_ocorridos), meta: { op: '>=', v: 100 }, metaTxt: '100%' },
    { id: 'J', grupo: 'Rotina e ações', nome: 'Etapas do onboarding em dia', un: '%', calc: r => razao(r.onb_prazo, r.onb_previstas), meta: { op: '>=', v: 90 }, metaTxt: '90% ou mais' },
    { id: 'K', grupo: 'Rotina e ações', nome: 'Respostas do NPS no trimestre', un: '%', calc: r => razao(r.nps_respostas, r.base_clientes), meta: { op: '>=', v: 70 }, metaTxt: '70% ou mais' },
    { id: 'L', grupo: 'Rotina e ações', nome: 'Oportunidades de upsell no mês', un: 'qtd', calc: (r, c) => c.mes.some(x => !isBlank(x.upsell)) ? c.mes.reduce((s, x) => s + (n(x.upsell) || 0), 0) : null, meta: { op: '>=', v: 2 }, metaTxt: '2 ou mais por mês' },
    { id: 'M', grupo: 'Vendas dos clientes', nome: 'Faturamento da carteira na semana', un: 'R$', calc: r => n(r.faturamento), sub: r => isBlank(r.pedidos) ? '' : `${fmt.num(r.pedidos, 0)} pedidos` },
    { id: 'N', grupo: 'Vendas dos clientes', nome: 'Variação do faturamento', un: 'var', calc: (r, c) => c.anterior && n(c.anterior.faturamento) ? (n(r.faturamento) / n(c.anterior.faturamento) - 1) * 100 : null, sub: () => 'em relação à semana anterior' },
    { id: 'O', grupo: 'Vendas dos clientes', nome: 'Ticket médio da carteira', un: 'R$', calc: r => n(r.pedidos) ? n(r.faturamento) / n(r.pedidos) : null },
    { id: 'P', grupo: 'Vendas dos clientes', nome: 'Clientes com queda acima de 20% no mês', un: 'qtd', calc: (r, c) => { const x = c.mes.find(m => !isBlank(m.queda_clientes)); return x ? n(x.queda_clientes) : null; }, sub: () => 'lançado na 1ª semana do mês' },
    { id: 'Q', grupo: 'Vendas dos clientes', nome: 'Clientes em queda contatados', un: '%', calc: (r, c) => { const x = c.mes.find(m => !isBlank(m.queda_clientes)); if (!x) return null; const cont = c.mes.reduce((s, m) => s + (n(m.queda_contatados) || 0), 0); return razao(cont, x.queda_clientes); }, meta: { op: '>=', v: 100 }, metaTxt: '100%' },
    { id: 'R', grupo: 'Churn e aviso prévio', nome: 'Churn da semana', un: 'qtd', calc: r => n(r.churn_clientes), sub: r => isBlank(r.churn_mensalidade) ? '' : `${fmt.money(r.churn_mensalidade)} de mensalidade` },
    { id: 'S', grupo: 'Churn e aviso prévio', nome: 'Novos avisos prévios', un: 'qtd', calc: r => n(r.avisos_novos), sub: r => isBlank(r.avisos_andamento) ? '' : `${fmt.num(r.avisos_andamento, 0)} em andamento` },
    { id: 'T', grupo: 'Churn e aviso prévio', nome: 'Reunião de retenção marcada a tempo', un: '%', calc: r => razao(r.reunioes_prazo, r.avisos_novos), meta: { op: '>=', v: 100 }, metaTxt: '100% em até 2 dias úteis' },
    { id: 'U', grupo: 'Churn e aviso prévio', nome: 'Avisos revertidos', un: '%', calc: r => razao(r.avisos_revertidos, r.avisos_com_reuniao), sub: () => 'dos avisos com reunião' },
  ];

  function status(ind, valor, seg) {
    if (valor === null || !ind.meta) return '';
    if (ind.meta.aPartirDoDia && dates.toDate(dates.addDays(seg, 4)).getDate() < ind.meta.aPartirDoDia && seg.slice(0, 7) === dates.addDays(seg, 4).slice(0, 7)) return '';
    return (ind.meta.op === '>=' ? valor >= ind.meta.v : valor <= ind.meta.v) ? 'ok' : 'alerta';
  }
  function valorTxt(ind, v) {
    if (v === null) return '—';
    switch (ind.un) {
      case '%': return fmt.num(v, 0) + '%';
      case 'var': return (v > 0 ? '+' : '') + fmt.num(v, 1) + '%';
      case 'R$': return fmt.money(v);
      case 'min': return fmt.num(v, 0) + ' min';
      case 'dias': return `${fmt.num(v, 0)} de 5`;
      case 'sim': return v ? 'Enviado' : 'Não enviado';
      default: return fmt.num(v, 0);
    }
  }
  // contexto: semana anterior e semanas do mesmo mês (até a atual) do mesmo colaborador
  function contexto(regs, r) {
    const doUser = regs.filter(x => x.usuario === r.usuario);
    const anterior = doUser.find(x => x.semana === dates.addDays(r.semana, -7)) || null;
    const mes = doUser.filter(x => x.semana.slice(0, 7) === r.semana.slice(0, 7) && x.semana <= r.semana);
    return { anterior, mes };
  }

  return { email, nome, segundaDe, diasUteis, semanaTxt, DIAS, rotina, REGRAS, CAMPOS_SEMANA, CAMPOS, autoCS, INDICADORES, status, valorTxt, contexto };
})();
