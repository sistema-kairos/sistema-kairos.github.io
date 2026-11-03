// Rotina, registro semanal e indicadores do CS.
//   'cs_rotina'  id = '<e-mail>|<AAAA-MM-DD>'       → { usuario, nome, data, feitos: { <bloco>: true }, contatos: { <cliente>: { cliente, hora } }, obs }
//   'cs_semana'  id = '<e-mail>|<segunda AAAA-MM-DD>' → { usuario, nome, semana, ...campos de CAMPOS_SEMANA }
// Foco do CS: performance dos clientes, atendimento e frequência de presença.
// Metas, horários e textos ficam aqui para ajustar sem mexer nas telas.
const Estagio = (() => {
  const email = () => (Store.getSession()?.email || 'local').toLowerCase();
  const nome = () => Store.perfil().nome || Store.getSession()?.email || 'Modo local';

  // ---------- semanas (segunda a sexta) ----------
  const segundaDe = iso => { const d = dates.toDate(iso); return dates.addDays(iso, -((d.getDay() + 6) % 7)); };
  const diasUteis = seg => [0, 1, 2, 3, 4].map(i => dates.addDays(seg, i));
  const semanaTxt = seg => `${fmt.date(seg).slice(0, 5)} a ${fmt.date(dates.addDays(seg, 4)).slice(0, 5)}`;

  const CONVERSAS_DIA = 10;

  // ---------- rotina do dia (13h às 19h) ----------
  const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  const CARDAPIO = { id: 'cardapio', titulo: 'Análise de cardápio e relatório', desc: 'Analisar o cardápio de 3 clientes: produtos, gramatura, sabores, itens diferentes, bebidas e o que mais puder melhorar as vendas. No fim, enviar no WhatsApp de cada um o relatório com as sugestões de melhoria.', ind: 'J, K' };
  const REUNIAO = { id: 'reuniao', titulo: 'Reuniões com clientes', desc: 'Fazer as reuniões marcadas com clientes de vendas baixas ou em queda forte. Meta: pelo menos 3 reuniões na semana.', ind: 'F, N', link: { href: 'cs-faturamento.html?filtro=reuniao', txt: 'Ver quem precisa de reunião' } };
  const SOLUCOES = { id: 'solucoes', titulo: 'Soluções e reuniões', desc: 'Com o retorno da expedição, propor uma solução a cada cliente que está dando problema na operação. Usar o tempo que sobrar para reuniões com clientes em queda.', ind: 'L, F' };
  function blocoDoDia(dow) {
    switch (dow) {
      case 1: return [
        { id: 'oportunidades', titulo: 'Upsell, expansão e agenda da semana', desc: 'Analisar os clientes com maior potencial de upsell e de expansão para outros hubs e marcar conversas com eles. Marcar as reuniões da semana com quem está com vendas baixas ou em queda.', ind: 'P, N', link: { href: 'cs-faturamento.html', txt: 'Abrir Faturamento dos clientes' } },
        SOLUCOES];
      case 2: return [CARDAPIO, REUNIAO];
      case 3: return [
        { id: 'hub', titulo: 'Visita ao hub', desc: 'Ir até o hub e verificar o espaço de cada cliente (estoque, organização, freezer) para validar o que precisa ser feito.', ind: 'G' },
        { id: 'visita_loja', titulo: 'Visita a loja de cliente', desc: 'Visitar a loja de um cliente para entender a demanda dele e encantar. Aproveitar para criar conexões com outros clientes e parceiros.', ind: 'H, Q' }];
      case 4: return [CARDAPIO, REUNIAO];
      case 5: return [
        { id: 'reonboarding', titulo: 'Reonboarding e conexões', desc: 'Refazer o treinamento com os clientes que têm mais de 1% de pedidos com erro. Depois, criar conexões entre clientes e com parceiros.', ind: 'M, Q', link: { href: 'cs-faturamento.html?filtro=erro', txt: 'Ver clientes com erro acima de 1%' } },
        SOLUCOES];
      default: return null;
    }
  }
  function rotina(iso) {
    const dow = dates.toDate(iso).getDay();
    if (dow === 0 || dow === 6) return [];
    const [bloco, tarde] = blocoDoDia(dow);
    // nos dias de faturamento, a análise da planilha entra no lugar do bloco das 16h
    const fecha = typeof Fat !== 'undefined' ? Fat.diaDeAnalise(iso) : null;
    const fim = fecha
      ? { id: 'faturamento', titulo: `Faturamento: clientes que fecham dia ${String(fecha).padStart(2, '0')}`, desc: 'Conferir o faturamento do mês na planilha: quem está abaixo da meta do espaço, quem caiu muito em relação ao mês anterior e quais clientes estão inativos. Marcar reunião com quem estiver com vendas muito baixas ou com variação muito forte.', ind: 'N, S', link: { href: 'cs-faturamento.html', txt: 'Abrir Faturamento dos clientes' } }
      : tarde;
    return [
      { id: 'chatpro1', ini: '13:00', fim: '13:45', titulo: 'ChatPro: pendências', desc: 'Resolver todas as pendências do ChatPro (1ª rodada do dia).', ind: 'A, B, C' },
      { id: 'conversas', ini: '13:45', fim: '14:15', titulo: `Conversa com ${CONVERSAS_DIA} clientes`, desc: `Mandar mensagem para os ${CONVERSAS_DIA} clientes do dia, começando pelos de menor volume (lista abaixo). Seja interessante antes de ser interesseiro: leve algo útil para o cliente.`, ind: 'D, E' },
      { id: 'expedicao', ini: '14:15', fim: '14:30', titulo: 'Fotos dos espaços e problemas na operação', desc: 'Pedir para a expedição tirar foto dos espaços de todos os clientes. Na mesma mensagem, perguntar se algum cliente está dando muito problema na operação.', ind: 'I, L' },
      { ...bloco, ini: '14:30', fim: '16:00' },
      { ...fim, ini: '16:00', fim: '17:00' },
      { id: 'retornos', ini: '17:00', fim: '18:00', titulo: 'Retornos e indicações', desc: 'Responder os clientes do dia, fechar o que ficou em aberto e, com quem a conversa foi boa, pedir uma indicação. Meta: 1 indicação para cada 2 clientes no mês.', ind: 'D, O' },
      { id: 'chatpro2', ini: '18:00', fim: '18:45', titulo: 'ChatPro: pendências', desc: 'Resolver as pendências do ChatPro (2ª rodada do dia).', ind: 'A, B, C' },
      dow === 5
        ? { id: 'fechamento', ini: '18:45', fim: '19:00', titulo: 'Fechamento e registro semanal', desc: 'Anotar o que ficou para segunda e lançar no Registro semanal as ações da semana.', ind: '' }
        : { id: 'fechamento', ini: '18:45', fim: '19:00', titulo: 'Fechamento', desc: 'Anotar o que ficou para amanhã: reuniões marcadas, soluções propostas e indicações.', ind: '' },
    ];
  }
  const REGRAS = [
    'O ChatPro fica aberto o tempo todo: a primeira resposta sai em até 15 minutos, mesmo durante os blocos.',
    'Onboarding e offboarding entram no lugar do bloco do dia quando aparecerem, e o bloco vai para o dia seguinte.',
    'Foco sempre em performance do cliente, atendimento e frequência de presença.',
  ];

  // conversas marcadas na rotina, por dia
  const contatosDe = r => Object.keys(r?.contatos || {}).length;

  // valores que vêm da Rotina do dia para o registro da semana
  function autoRotina(rotinas, pessoa, seg) {
    const dias = diasUteis(seg);
    const regs = dias.map(d => rotinas.find(r => r.usuario === pessoa && r.data === d)).filter(Boolean);
    if (!regs.length) return {};
    const conta = b => regs.filter(r => r.feitos?.[b]).length;
    const cardapios = regs.filter(r => r.feitos?.cardapio).length * 3;
    return {
      dias_chatpro: regs.filter(r => r.feitos?.chatpro1 && r.feitos?.chatpro2).length,
      conversas: regs.reduce((s, r) => s + contatosDe(r), 0) || null,
      dias_conversas: regs.filter(r => contatosDe(r) >= CONVERSAS_DIA).length,
      dias_fotos: conta('expedicao'),
      visita_hub: conta('hub') ? 'Sim' : null,
      cardapios: cardapios || null,
    };
  }

  // ---------- registro semanal ----------
  // tipo: int | money | min | sim; fonte: de onde vem a sugestão quando o campo está vazio (rotina, planilha ou cs)
  const CAMPOS_SEMANA = [
    { grupo: 'Atendimento', campos: [
      { key: 'dias_chatpro', label: 'Dias com as duas rodadas do ChatPro (0 a 5)', tipo: 'int', ind: 'A', fonte: 'rotina', max: 5 },
      { key: 'tempo_resposta', label: 'Tempo médio da primeira resposta (minutos)', tipo: 'min', ind: 'B' },
      { key: 'demandas_total', label: 'Demandas recebidas', tipo: 'int', ind: 'C' },
      { key: 'demandas_prazo', label: 'Demandas resolvidas no prazo', tipo: 'int', ind: 'C' },
    ] },
    { grupo: 'Presença com o cliente', campos: [
      { key: 'conversas', label: 'Conversas com clientes na semana', tipo: 'int', ind: 'D', fonte: 'rotina' },
      { key: 'dias_conversas', label: `Dias com ${CONVERSAS_DIA} conversas ou mais (0 a 5)`, tipo: 'int', ind: 'E', fonte: 'rotina', max: 5 },
      { key: 'reunioes', label: 'Reuniões com clientes realizadas', tipo: 'int', ind: 'F' },
      { key: 'visita_hub', label: 'Visita ao hub feita', tipo: 'sim', ind: 'G', fonte: 'rotina' },
      { key: 'visitas_lojas', label: 'Visitas a lojas de clientes', tipo: 'int', ind: 'H' },
      { key: 'dias_fotos', label: 'Dias com fotos dos espaços pedidas à expedição (0 a 5)', tipo: 'int', ind: 'I', fonte: 'rotina', max: 5 },
    ] },
    { grupo: 'Performance dos clientes', campos: [
      { key: 'cardapios', label: 'Cardápios analisados', tipo: 'int', ind: 'J', fonte: 'rotina' },
      { key: 'relatorios', label: 'Relatórios de melhoria enviados no WhatsApp', tipo: 'int', ind: 'K' },
      { key: 'problemas', label: 'Clientes com problema na operação', tipo: 'int', ind: 'L' },
      { key: 'problemas_solucao', label: 'Desses, com solução proposta', tipo: 'int', ind: 'L' },
      { key: 'erro_clientes', label: 'Clientes com mais de 1% de pedidos com erro', tipo: 'int', ind: 'M', fonte: 'planilha' },
      { key: 'reonboardados', label: 'Desses, que refizeram o treinamento', tipo: 'int', ind: 'M' },
      { key: 'reuniao_clientes', label: 'Clientes que precisam de reunião (vendas baixas ou queda forte)', tipo: 'int', ind: 'N', fonte: 'planilha' },
      { key: 'reuniao_marcada', label: 'Desses, com reunião marcada ou feita', tipo: 'int', ind: 'N' },
      { key: 'indicacoes', label: 'Indicações conseguidas na semana', tipo: 'int', ind: 'O' },
      { key: 'base_clientes', label: 'Clientes ativos na carteira', tipo: 'int', ind: 'O', fonte: 'planilha' },
      { key: 'upsell_marcadas', label: 'Conversas de upsell marcadas', tipo: 'int', ind: 'P' },
      { key: 'expansao_marcadas', label: 'Conversas de expansão marcadas', tipo: 'int', ind: 'P' },
      { key: 'conexoes', label: 'Conexões criadas entre clientes e parceiros', tipo: 'int', ind: 'Q' },
      { key: 'onb_previstas', label: 'Etapas de onboarding/offboarding previstas', tipo: 'int', ind: 'R' },
      { key: 'onb_prazo', label: 'Etapas de onboarding/offboarding feitas no prazo', tipo: 'int', ind: 'R' },
      { key: 'abaixo_meta', label: 'Clientes abaixo da meta do espaço', tipo: 'int', ind: 'S', fonte: 'planilha' },
    ] },
    { grupo: 'Churn e aviso prévio', campos: [
      { key: 'churn_clientes', label: 'Clientes que saíram na semana', tipo: 'int', ind: 'T', fonte: 'cs' },
      { key: 'churn_mensalidade', label: 'Mensalidade perdida na semana (R$)', tipo: 'money', ind: 'T', fonte: 'cs' },
      { key: 'avisos_novos', label: 'Novos avisos prévios na semana', tipo: 'int', ind: 'U, V', fonte: 'cs' },
      { key: 'avisos_andamento', label: 'Avisos prévios em andamento', tipo: 'int', ind: 'U', fonte: 'cs' },
      { key: 'reunioes_prazo', label: 'Reuniões de retenção marcadas em até 2 dias úteis', tipo: 'int', ind: 'V' },
      { key: 'avisos_com_reuniao', label: 'Avisos com reunião de retenção feita', tipo: 'int', ind: 'W' },
      { key: 'avisos_revertidos', label: 'Avisos revertidos', tipo: 'int', ind: 'W' },
    ] },
  ];
  const CAMPOS = CAMPOS_SEMANA.flatMap(g => g.campos);
  // pares "parte ≤ total" conferidos ao salvar
  const PARES = [['demandas_prazo', 'demandas_total'], ['problemas_solucao', 'problemas'], ['reonboardados', 'erro_clientes'],
    ['reuniao_marcada', 'reuniao_clientes'], ['onb_prazo', 'onb_previstas'], ['reunioes_prazo', 'avisos_novos'], ['avisos_revertidos', 'avisos_com_reuniao']];

  // valores calculados das Solicitações de saída para a semana
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

  // valores da planilha de faturamento (mês de cobrança mais recente até a semana)
  function autoPlanilha(dadosFat, seg) {
    if (!dadosFat?.meses?.length) return {};
    const ate = dates.addDays(seg, 4).slice(0, 7);
    const mes = dadosFat.meses.filter(m => m <= ate).pop();
    if (!mes) return {};
    const { ativos } = Fat.clientes(dadosFat, mes);
    return {
      base_clientes: ativos.length,
      erro_clientes: ativos.filter(c => c.alertas.includes('erro')).length,
      reuniao_clientes: ativos.filter(c => c.reuniao).length,
      abaixo_meta: ativos.filter(c => c.alertas.includes('abaixo')).length,
    };
  }

  // ---------- indicadores ----------
  const n = v => isBlank(v) ? null : Number(v);
  const razao = (a, b) => (n(a) === null || !n(b)) ? null : n(a) / n(b) * 100;
  const somaMes = (c, k) => c.mes.some(x => !isBlank(x[k])) ? c.mes.reduce((s, x) => s + (n(x[k]) || 0), 0) : null;
  // meta: { op: '>=' | '<=', v } → status ok/alerta; sem meta = acompanhamento
  // r = registro da semana; ctx = { anterior, mes: registros do mesmo mês até a semana }
  const INDICADORES = [
    { id: 'A', grupo: 'Atendimento', nome: 'ChatPro: duas rodadas por dia', un: 'dias', calc: r => n(r.dias_chatpro), meta: { op: '>=', v: 5 }, metaTxt: '5 de 5 dias' },
    { id: 'B', grupo: 'Atendimento', nome: 'Tempo médio da primeira resposta', un: 'min', calc: r => n(r.tempo_resposta), meta: { op: '<=', v: 15 }, metaTxt: 'até 15 min' },
    { id: 'C', grupo: 'Atendimento', nome: 'Demandas resolvidas no prazo', un: '%', calc: r => razao(r.demandas_prazo, r.demandas_total), meta: { op: '>=', v: 90 }, metaTxt: '90% ou mais' },
    { id: 'D', grupo: 'Presença com o cliente', nome: 'Conversas com clientes', un: 'qtd', calc: r => n(r.conversas), meta: { op: '>=', v: CONVERSAS_DIA * 5 }, metaTxt: `${CONVERSAS_DIA * 5} na semana (${CONVERSAS_DIA} por dia)` },
    { id: 'E', grupo: 'Presença com o cliente', nome: `Dias com ${CONVERSAS_DIA} conversas`, un: 'dias', calc: r => n(r.dias_conversas), meta: { op: '>=', v: 5 }, metaTxt: '5 de 5 dias' },
    { id: 'F', grupo: 'Presença com o cliente', nome: 'Reuniões com clientes', un: 'qtd', calc: r => n(r.reunioes), meta: { op: '>=', v: 3 }, metaTxt: '3 ou mais por semana' },
    { id: 'G', grupo: 'Presença com o cliente', nome: 'Visita ao hub', un: 'sim', calc: r => isBlank(r.visita_hub) ? null : (r.visita_hub === 'Sim' ? 1 : 0), meta: { op: '>=', v: 1 }, metaTxt: '1 por semana' },
    { id: 'H', grupo: 'Presença com o cliente', nome: 'Visitas a lojas de clientes', un: 'qtd', calc: r => n(r.visitas_lojas), meta: { op: '>=', v: 1 }, metaTxt: '1 ou mais por semana' },
    { id: 'I', grupo: 'Presença com o cliente', nome: 'Fotos dos espaços pedidas', un: 'dias', calc: r => n(r.dias_fotos), meta: { op: '>=', v: 5 }, metaTxt: '5 de 5 dias' },
    { id: 'J', grupo: 'Performance dos clientes', nome: 'Cardápios analisados', un: 'qtd', calc: r => n(r.cardapios), meta: { op: '>=', v: 6 }, metaTxt: '6 por semana (3 às terças e quintas)' },
    { id: 'K', grupo: 'Performance dos clientes', nome: 'Relatórios de melhoria enviados', un: '%', calc: r => razao(r.relatorios, r.cardapios), meta: { op: '>=', v: 100 }, metaTxt: '1 para cada cardápio analisado' },
    { id: 'L', grupo: 'Performance dos clientes', nome: 'Problemas na operação com solução proposta', un: '%', calc: r => razao(r.problemas_solucao, r.problemas), meta: { op: '>=', v: 100 }, metaTxt: '100%' },
    { id: 'M', grupo: 'Performance dos clientes', nome: 'Clientes com erro acima de 1% retreinados', un: '%', calc: r => razao(r.reonboardados, r.erro_clientes), meta: { op: '>=', v: 100 }, metaTxt: '100%' },
    { id: 'N', grupo: 'Performance dos clientes', nome: 'Clientes em queda com reunião', un: '%', calc: r => razao(r.reuniao_marcada, r.reuniao_clientes), meta: { op: '>=', v: 100 }, metaTxt: '100%' },
    { id: 'O', grupo: 'Performance dos clientes', nome: 'Indicações no mês', un: '%', calc: (r, c) => razao(somaMes(c, 'indicacoes'), r.base_clientes), meta: { op: '>=', v: 50, fimDoMes: true }, metaTxt: '1 para cada 2 clientes no mês',
      sub: (r, c) => { const s = somaMes(c, 'indicacoes'); return s === null ? '' : `${fmt.num(s, 0)} indicações no mês`; } },
    { id: 'P', grupo: 'Performance dos clientes', nome: 'Conversas de upsell e expansão marcadas', un: 'qtd', calc: r => isBlank(r.upsell_marcadas) && isBlank(r.expansao_marcadas) ? null : (n(r.upsell_marcadas) || 0) + (n(r.expansao_marcadas) || 0),
      sub: r => isBlank(r.upsell_marcadas) && isBlank(r.expansao_marcadas) ? '' : `${fmt.num(r.upsell_marcadas || 0, 0)} upsell · ${fmt.num(r.expansao_marcadas || 0, 0)} expansão` },
    { id: 'Q', grupo: 'Performance dos clientes', nome: 'Conexões entre clientes e parceiros', un: 'qtd', calc: r => n(r.conexoes) },
    { id: 'R', grupo: 'Performance dos clientes', nome: 'Onboarding e offboarding em dia', un: '%', calc: r => razao(r.onb_prazo, r.onb_previstas), meta: { op: '>=', v: 90 }, metaTxt: '90% ou mais' },
    { id: 'S', grupo: 'Performance dos clientes', nome: 'Clientes abaixo da meta do espaço', un: 'qtd', calc: r => n(r.abaixo_meta), sub: () => '1/4: R$ 8 mil · 1/2: R$ 14 mil · 1 freezer: R$ 40 mil' },
    { id: 'T', grupo: 'Churn e aviso prévio', nome: 'Churn da semana', un: 'qtd', calc: r => n(r.churn_clientes), sub: r => isBlank(r.churn_mensalidade) ? '' : `${fmt.money(r.churn_mensalidade)} de mensalidade` },
    { id: 'U', grupo: 'Churn e aviso prévio', nome: 'Novos avisos prévios', un: 'qtd', calc: r => n(r.avisos_novos), sub: r => isBlank(r.avisos_andamento) ? '' : `${fmt.num(r.avisos_andamento, 0)} em andamento` },
    { id: 'V', grupo: 'Churn e aviso prévio', nome: 'Reunião de retenção marcada a tempo', un: '%', calc: r => razao(r.reunioes_prazo, r.avisos_novos), meta: { op: '>=', v: 100 }, metaTxt: '100% em até 2 dias úteis' },
    { id: 'W', grupo: 'Churn e aviso prévio', nome: 'Avisos revertidos', un: '%', calc: r => razao(r.avisos_revertidos, r.avisos_com_reuniao), sub: () => 'dos avisos com reunião' },
  ];

  function status(ind, valor, seg) {
    if (valor === null || !ind.meta) return '';
    // meta mensal: só cobra na última semana do mês (antes disso é acompanhamento)
    if (ind.meta.fimDoMes && dates.addDays(seg, 7).slice(0, 7) === seg.slice(0, 7)) return valor >= ind.meta.v ? 'ok' : '';
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
      case 'sim': return v ? 'Feita' : 'Não feita';
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

  return { email, nome, segundaDe, diasUteis, semanaTxt, DIAS, CONVERSAS_DIA, rotina, REGRAS, contatosDe, autoRotina,
    CAMPOS_SEMANA, CAMPOS, PARES, autoCS, autoPlanilha, INDICADORES, status, valorTxt, contexto };
})();
