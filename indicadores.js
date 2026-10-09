// Indicadores por área (MKT, Comercial, CS): lançamento mensal, fórmulas e valores calculados pelo sistema.
// Cada área grava na própria tabela (ind_mkt, ind_comercial, ind_cs), então só a equipe da área altera os seus números.
//   registro '_config'  → { indicadores: [...], inicio } (lista, metas, fórmulas e mês em que os indicadores começam)
//   registro 'AAAA-MM'  → { mes, valores: { id: n } }  (valores lançados no mês)
// Tipos de indicador:
//   manual  – lançado pela equipe
//   auto    – o sistema calcula a partir dos cadastros (CRM, Clientes, CS, Leads); se alguém lançar um valor, ele prevalece
//   formula – calculado a partir de outros indicadores da área, pelo código (ex.: investimento / leads)
(() => {
  if (window.SEM_ACESSO) return;

  const AREAS = {
    MKT: { tabela: 'ind_mkt', nome: 'Marketing' },
    Comercial: { tabela: 'ind_comercial', nome: 'Comercial' },
    CS: { tabela: 'ind_cs', nome: 'CS' },
  };
  const AREA = window.IND_AREA;
  const MODO = window.IND_MODO || 'tabela';   // 'dashboard' em dashboard-mkt.html
  // meses anteriores a este ficam zerados (sem valores lançados nem calculados); muda em "Gerenciar indicadores"
  const INICIO_PADRAO = '2026-10';
  const { tabela, nome: NOME_AREA } = AREAS[AREA];
  const canEdit = Store.podeEditar(tabela);

  const UNIDADES = { numero: 'Número', moeda: 'R$', pct: '%', m2: 'm²', dias: 'Dias' };
  const fmtU = (u, v) => {
    if (isBlank(v)) return '—';
    if (u === 'moeda') return fmt.money(v);
    if (u === 'pct') return fmt.pct(Math.round(v * 100) / 100);
    if (u === 'm2') return fmt.num(v, 1) + ' m²';
    if (u === 'dias') return fmt.num(v, 1) + ' dias';
    return fmt.num(v, 2);
  };

  const ind = (id, nome, unidade, tipo, extra = {}) => ({ id, nome, unidade, tipo, melhor: 'maior', ...extra });
  const PADRAO = {
    MKT: [
      // funil
      ind('visitantes', 'Visitantes do formulário', 'numero', 'auto', { fonte: 'visitas.formulario' }),
      ind('leads_formulario', 'Leads do formulário', 'numero', 'auto', { fonte: 'leads.recebidos' }),
      ind('conv_visitante', 'Conversão visitante → lead', 'pct', 'formula', { formula: 'leads_formulario / visitantes * 100' }),
      ind('leads', 'Leads', 'numero', 'auto', { fonte: 'crm.leads_mkt' }),
      ind('vendas', 'Vendas', 'numero', 'auto', { fonte: 'crm.vendas_mkt' }),
      ind('taxa_conversao', 'Taxa de conversão (lead → venda)', 'pct', 'formula', { formula: 'vendas / leads * 100' }),
      ind('receita_vendas', 'Receita das vendas', 'moeda', 'auto', { fonte: 'crm.receita_mkt' }),
      // mídia paga (lançado à mão até a automação com Meta/Google Ads)
      ind('investimento', 'Investimento em mídia', 'moeda', 'manual', { melhor: '' }),
      ind('impressoes', 'Impressões', 'numero', 'manual'),
      ind('cliques', 'Cliques', 'numero', 'manual'),
      ind('ctr', 'CTR dos anúncios', 'pct', 'formula', { formula: 'cliques / impressoes * 100' }),
      ind('cpl', 'Custo por lead (CPL)', 'moeda', 'formula', { formula: 'investimento / leads', melhor: 'menor' }),
      ind('cpc', 'CPC', 'moeda', 'formula', { formula: 'investimento / cliques', melhor: 'menor' }),
      ind('cpa', 'CPA', 'moeda', 'formula', { formula: 'investimento / vendas', melhor: 'menor' }),
      ind('cpm', 'CPM', 'moeda', 'formula', { formula: 'investimento / impressoes * 1000', melhor: 'menor' }),
      ind('taxa_retorno', 'Taxa de retorno (ROI)', 'pct', 'formula', { formula: '(receita_vendas - investimento) / investimento * 100' }),
      // e-mail marketing (lançado à mão até a automação com a ferramenta de e-mail)
      ind('emails_entregues', 'E-mails entregues', 'numero', 'manual'),
      ind('emails_abertos', 'E-mails abertos', 'numero', 'manual'),
      ind('emails_clicados', 'E-mails com clique', 'numero', 'manual'),
      ind('taxa_abertura', 'Taxa de abertura de e-mail', 'pct', 'formula', { formula: 'emails_abertos / emails_entregues * 100' }),
      ind('taxa_cliques', 'Taxa de cliques do e-mail', 'pct', 'formula', { formula: 'emails_clicados / emails_entregues * 100' }),
      ind('ctor', 'CTOR', 'pct', 'formula', { formula: 'emails_clicados / emails_abertos * 100' }),
      // qualificação
      ind('leads_qualificados', 'Leads qualificados (MQL)', 'numero', 'manual'),
      ind('cpl_qualificado', 'CPL qualificado', 'moeda', 'formula', { formula: 'investimento / leads_qualificados', melhor: 'menor' }),
      ind('taxa_qualificacao', 'Taxa de qualificação', 'pct', 'formula', { formula: 'leads_qualificados / leads * 100' }),
    ],
    Comercial: [
      ind('leads_recebidos', 'Leads recebidos', 'numero', 'auto', { fonte: 'crm.criadas' }),
      ind('reunioes', 'Reuniões iniciais', 'numero', 'auto', { fonte: 'crm.reunioes' }),
      ind('visitas', 'Visitas', 'numero', 'auto', { fonte: 'crm.visitas' }),
      ind('contratos', 'Contratos fechados', 'numero', 'auto', { fonte: 'comercial.contratos' }),
      ind('receita_fechada', 'Mensalidade fechada', 'moeda', 'auto', { fonte: 'comercial.mensalidade' }),
      ind('ticket_medio', 'Ticket médio', 'moeda', 'formula', { formula: 'receita_fechada / contratos' }),
      ind('espaco_fechado', 'Espaço total fechado', 'm2', 'manual'),
      ind('espaco_medio', 'Espaço médio fechado', 'm2', 'formula', { formula: 'espaco_fechado / contratos' }),
      ind('conversao', 'Conversão lead → contrato', 'pct', 'formula', { formula: 'contratos / leads_recebidos * 100' }),
      ind('perdidas', 'Negociações perdidas', 'numero', 'auto', { fonte: 'crm.perdidas', melhor: 'menor' }),
      ind('ciclo_venda', 'Ciclo médio de venda', 'dias', 'manual', { melhor: 'menor' }),
    ],
    CS: [
      ind('clientes_ativos', 'Clientes ativos (fim do mês)', 'numero', 'auto', { fonte: 'cs.ativos', agregacao: 'ultimo' }),
      ind('solicitacoes', 'Solicitações de saída (A.P)', 'numero', 'auto', { fonte: 'cs.solicitacoes', melhor: 'menor' }),
      ind('saidas', 'Saídas efetivadas', 'numero', 'auto', { fonte: 'cs.saidas', melhor: 'menor' }),
      ind('churn_clientes', 'Churn de clientes', 'pct', 'formula', { formula: 'saidas / clientes_ativos * 100', melhor: 'menor' }),
      ind('faturamento_perdido', 'Faturamento perdido', 'moeda', 'auto', { fonte: 'cs.faturamento_perdido', melhor: 'menor' }),
      ind('faturamento_base', 'Faturamento mensal base', 'moeda', 'auto', { fonte: 'config.faturamento_base', melhor: '', agregacao: 'ultimo' }),
      ind('churn_faturamento', 'Churn de faturamento', 'pct', 'formula', { formula: 'faturamento_perdido / faturamento_base * 100', melhor: 'menor' }),
      ind('reunioes_ap', 'Reuniões de A.P realizadas', 'numero', 'manual'),
      ind('nps', 'NPS', 'numero', 'manual', { agregacao: 'media' }),
      ind('upsells', 'Upsells', 'numero', 'manual'),
    ],
  };
  const agregacaoPadrao = i => i.agregacao || (['pct', 'dias'].includes(i.unidade) ? 'media' : 'soma');

  // ---------- valores calculados pelo sistema ----------
  const mesCliente = c => c.mes_fechamento || dates.ym(c.data_entrada_real) || dates.ym(c.data_entrada_contrato);
  const fimDoMes = ym => { const [y, m] = ym.split('-').map(Number); return dates.toISO(new Date(y, m, 0)); };
  const chegouEm = etapa => (D, ym) => D.crm.filter(d => (d.historico || []).some(h => h.etapa === etapa && dates.ym(h.em) === ym)).length;
  function receitaCS(D, r) {
    const com = D.comercial.find(c => norm(c.nome_loja) === norm(r.loja)) || {};
    const variavel = isDK(r.modelo || com.modelo)
      ? Number(isBlank(r.taxa_variavel_rs) ? com.taxa_variavel_rs : r.taxa_variavel_rs) || 0
      : (Number(r.faturamento_medio) || 0) * (Number(r.taxa_variavel) || 0) / 100;
    return (Number(r.mensalidade_fixa) || 0) + variavel;
  }
  const primeiro = arr => arr.filter(Boolean).sort()[0] || null;
  // leads de marketing = negociações do CRM que não vieram de prospecção ativa (mesma regra da coleta das Sprints)
  const ehMkt = d => !/prospec/i.test(d.fonte || '');
  const fechouEm = (d, ym) => (d.historico || []).some(h => h.etapa === 'Negócio fechado' && dates.ym(h.em) === ym);
  const desdeCrm = D => primeiro(D.crm.map(d => dates.ym(d.criado_em)));
  const saidasNoMes = (D, ym) => D.cs.filter(r => dates.ym(r.data_saida_prevista) === ym && r.data_saida_prevista <= dates.today());
  const FONTES = {
    'leads.recebidos': { nome: 'Respostas do formulário de leads no mês', tabelas: ['leads'], desde: D => primeiro(D.leads.map(l => dates.ym(l.recebido_em))), calc: (D, ym) => D.leads.filter(l => dates.ym(l.recebido_em) === ym).length },
    'visitas.formulario': { nome: 'Visitas ao formulário no mês (cada navegador conta 1 vez por dia)', tabelas: ['visitas'], desde: D => primeiro(D.visitas.map(v => dates.ym(v.dia))), calc: (D, ym) => D.visitas.filter(v => dates.ym(v.dia) === ym).reduce((s, v) => s + (Number(v.n) || 0), 0) },
    'crm.leads_mkt': { desde: desdeCrm, nome: 'Negociações criadas no CRM no mês, exceto prospecção ativa', tabelas: ['crm'], calc: (D, ym) => D.crm.filter(d => ehMkt(d) && dates.ym(d.criado_em) === ym).length },
    'crm.vendas_mkt': { desde: desdeCrm, nome: 'Negociações (exceto prospecção ativa) que entraram em "Negócio fechado" no mês', tabelas: ['crm'], calc: (D, ym) => D.crm.filter(d => ehMkt(d) && fechouEm(d, ym)).length },
    'crm.receita_mkt': { desde: desdeCrm, nome: 'Valor total das negociações (exceto prospecção ativa) fechadas no mês', tabelas: ['crm'], calc: (D, ym) => D.crm.filter(d => ehMkt(d) && fechouEm(d, ym)).reduce((s, d) => s + (Number(d.valor_total) || 0), 0) },
    'crm.criadas': { desde: D => primeiro(D.crm.map(d => dates.ym(d.criado_em))), nome: 'Negociações criadas no CRM no mês', tabelas: ['crm'], calc: (D, ym) => D.crm.filter(d => dates.ym(d.criado_em) === ym).length },
    'crm.reunioes': { desde: D => primeiro(D.crm.map(d => dates.ym(d.criado_em))), nome: 'Negociações que entraram em "Reunião inicial" no mês', tabelas: ['crm'], calc: chegouEm('Reunião inicial') },
    'crm.visitas': { desde: D => primeiro(D.crm.map(d => dates.ym(d.criado_em))), nome: 'Negociações que entraram em "Visita" no mês', tabelas: ['crm'], calc: chegouEm('Visita') },
    'crm.fechadas': { desde: D => primeiro(D.crm.map(d => dates.ym(d.criado_em))), nome: 'Negociações que entraram em "Negócio fechado" no mês', tabelas: ['crm'], calc: chegouEm('Negócio fechado') },
    'crm.perdidas': { desde: D => primeiro(D.crm.map(d => dates.ym(d.criado_em))), nome: 'Negociações marcadas como perdidas no mês', tabelas: ['crm'], calc: chegouEm('Perdido') },
    'comercial.contratos': { desde: D => primeiro(D.comercial.map(mesCliente)), nome: 'Clientes com mês de fechamento no mês (aba Clientes)', tabelas: ['comercial'], calc: (D, ym) => D.comercial.filter(c => mesCliente(c) === ym).length },
    'comercial.mensalidade': { desde: D => primeiro(D.comercial.map(mesCliente)), nome: 'Soma das mensalidades fixas fechadas no mês', tabelas: ['comercial'], calc: (D, ym) => D.comercial.filter(c => mesCliente(c) === ym).reduce((s, c) => s + (Number(c.mensalidade_fixa) || 0), 0) },
    'cs.solicitacoes': { desde: D => primeiro(D.cs.map(r => dates.ym(r.data_solicitacao || r.data_saida_prevista))), nome: 'Solicitações de saída registradas no mês', tabelas: ['cs'], calc: (D, ym) => D.cs.filter(r => dates.ym(r.data_solicitacao) === ym).length },
    'cs.saidas': { desde: D => primeiro(D.cs.map(r => dates.ym(r.data_solicitacao || r.data_saida_prevista))), nome: 'Clientes com saída efetivada no mês', tabelas: ['cs'], calc: (D, ym) => saidasNoMes(D, ym).length },
    'cs.faturamento_perdido': { desde: D => primeiro(D.cs.map(r => dates.ym(r.data_solicitacao || r.data_saida_prevista))), nome: 'Faturamento (fixa + variável) dos clientes que saíram no mês', tabelas: ['cs', 'comercial'], calc: (D, ym) => saidasNoMes(D, ym).reduce((s, r) => s + receitaCS(D, r), 0) },
    'cs.ativos': { desde: D => primeiro(D.comercial.map(c => dates.ym(c.data_entrada_real || c.data_entrada_contrato) || c.mes_fechamento)), nome: 'Clientes da aba Clientes ativos no último dia do mês', tabelas: ['comercial', 'cs'], calc: (D, ym) => {
      const fim = fimDoMes(ym);
      const saiu = new Set(D.cs.filter(r => r.data_saida_prevista && r.data_saida_prevista <= fim).map(r => norm(r.loja)));
      return D.comercial.filter(c => {
        const ini = c.data_entrada_real || c.data_entrada_contrato || (c.mes_fechamento ? c.mes_fechamento + '-01' : null);
        return ini && ini <= fim && !saiu.has(norm(c.nome_loja));
      }).length;
    } },
    'config.faturamento_base': { nome: 'Faturamento mensal base (Configurações → Financeiro)', tabelas: [], calc: D => D.base },
  };

  // ---------- fórmulas ----------
  function compilar(formula, ids) {
    const toks = String(formula || '').match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:[.,]\d+)?|\S/g) || [];
    const refs = [];
    let js = '';
    for (const t of toks) {
      if (/^[A-Za-z_]/.test(t)) {
        if (!ids.includes(t)) throw new Error(`"${t}" não é o código de nenhum indicador desta área`);
        refs.push(t);
        js += `v[${JSON.stringify(t)}]`;
      } else if (/^\d/.test(t)) js += t.replace(',', '.');
      else if ('+-*/()'.includes(t)) js += t;
      else throw new Error(`Símbolo inválido na fórmula: ${t}`);
    }
    if (!js) throw new Error('Fórmula vazia');
    let fn;
    try { fn = new Function('v', `return (${js});`); } catch { throw new Error('Fórmula incompleta (confira parênteses e operadores)'); }
    return { refs: [...new Set(refs)], fn };
  }

  // ---------- estado ----------
  let indicadores = [];
  let lancados = {};   // { 'AAAA-MM': { id: valor } }
  let D = { leads: [], crm: [], comercial: [], cs: [], visitas: [], base: null };
  let inicio = INICIO_PADRAO;
  const antesDoInicio = ym => !!inicio && ym < inicio;
  let ano = Number(dates.today().slice(0, 4));
  let mesLanc = dates.today().slice(0, 7);
  let selecionado = null;
  let compiladas = {};

  function prepararFormulas() {
    compiladas = {};
    const ids = indicadores.map(i => i.id);
    indicadores.filter(i => i.tipo === 'formula').forEach(i => {
      try { compiladas[i.id] = compilar(i.formula, ids); } catch (e) { compiladas[i.id] = { erro: e.message }; }
    });
  }

  const autoCache = {};
  function valorAuto(i, ym) {
    const f = FONTES[i.fonte];
    if (!f || !f.tabelas.every(t => Store.podeLer(t))) return null;
    const k = i.fonte + '|' + ym;
    if (!(k in autoCache)) {
      try {
        const desde = f.desde?.(D);
        autoCache[k] = f.desde && (!desde || ym < desde) ? null : f.calc(D, ym);
      } catch { autoCache[k] = null; }
    }
    return autoCache[k];
  }

  const mesesDoAno = a => dates.monthRange(`${a}-01`, `${a}-12`);
  const mesFuturo = ym => ym > dates.today().slice(0, 7);

  // indicadores lançados/automáticos usados (direta ou indiretamente) por uma fórmula
  function folhas(id, pilha = new Set()) {
    const c = compiladas[id];
    if (!c) return [id];
    if (c.erro || pilha.has(id)) return [];
    pilha.add(id);
    return [...new Set(c.refs.flatMap(r => folhas(r, pilha)))];
  }

  // periodo: 'AAAA-MM' (mês), 'ANO:AAAA' (acumulado do ano até o mês atual)
  // ou 'MESES:AAAA-MM,AAAA-MM' (acumulado só desses meses)
  function valor(id, periodo, pilha = new Set()) {
    const i = indicadores.find(x => x.id === id);
    if (!i || pilha.has(id)) return null;
    if (i.tipo === 'formula' && periodo.startsWith('ANO:')) {
      // ex.: CPL do ano = investimento ÷ leads somando só os meses que têm os dois valores
      const fs = folhas(id);
      const meses = mesesDoAno(periodo.slice(4)).filter(m => !mesFuturo(m) && fs.every(f => valor(f, m) !== null));
      return meses.length ? valor(id, 'MESES:' + meses.join(','), pilha) : null;
    }
    if (i.tipo === 'formula') {
      const c = compiladas[id];
      if (!c || c.erro) return null;
      pilha.add(id);
      const v = {};
      for (const r of c.refs) { v[r] = valor(r, periodo, pilha); if (v[r] === null) { pilha.delete(id); return null; } }
      pilha.delete(id);
      const out = c.fn(v);
      return Number.isFinite(out) ? Math.round(out * 10000) / 10000 : null;
    }
    if (periodo.startsWith('ANO:') || periodo.startsWith('MESES:')) {
      const meses = periodo.startsWith('ANO:') ? mesesDoAno(periodo.slice(4)).filter(m => !mesFuturo(m)) : periodo.slice(6).split(',');
      const vals = meses.map(m => valor(id, m)).filter(x => x !== null);
      if (!vals.length) return null;
      const ag = agregacaoPadrao(i);
      if (ag === 'ultimo') return vals[vals.length - 1];
      const soma = vals.reduce((a, b) => a + b, 0);
      return ag === 'media' ? soma / vals.length : soma;
    }
    if (antesDoInicio(periodo)) return null;
    const lanc = lancados[periodo]?.[id];
    if (!isBlank(lanc)) return lanc;
    if (i.tipo === 'auto' && !mesFuturo(periodo)) return valorAuto(i, periodo);
    return null;
  }
  const origem = (i, ym) => (i.tipo === 'auto' && isBlank(lancados[ym]?.[i.id]) && valor(i.id, ym) !== null) ? 'auto' : '';
  function statusMeta(i, v) {
    if (isBlank(i.meta) || !i.melhor || v === null) return '';
    return (i.melhor === 'maior' ? v >= i.meta : v <= i.meta) ? 'hit' : 'miss';
  }

  // ---------- carregamento ----------
  async function carregar() {
    try {
      const rows = await Store.list(tabela);
      const cfg = rows.find(r => r.id === '_config');
      indicadores = cfg?.indicadores?.length ? cfg.indicadores : structuredClone(PADRAO[AREA]);
      inicio = cfg && 'inicio' in cfg ? cfg.inicio : INICIO_PADRAO;
      lancados = Object.fromEntries(rows.filter(r => /^\d{4}-\d{2}$/.test(r.id)).map(r => [r.id, r.valores || {}]));
    } catch (e) {
      toast('Erro ao carregar indicadores: ' + e.message, 'error');
      indicadores = structuredClone(PADRAO[AREA]);
    }
    prepararFormulas();
    const precisa = new Set(indicadores.filter(i => i.tipo === 'auto').flatMap(i => FONTES[i.fonte]?.tabelas || []));
    const ler = t => precisa.has(t) && Store.podeLer(t) ? Store.list(t).catch(() => []) : Promise.resolve([]);
    if (MODO === 'dashboard') precisa.add('crm');   // leads por canal
    const [leads, crm, comercial, cs, visitas, fin] = await Promise.all([ler('leads'), ler('crm'), ler('comercial'), ler('cs'), ler('visitas'),
      indicadores.some(i => i.fonte === 'config.faturamento_base') ? Store.get('config', 'financeiro').catch(() => null) : null]);
    D = { leads, crm, comercial, cs, visitas, base: Number(fin?.faturamentoMensalBase) || window.APP_CONFIG.faturamentoMensalBase || null };
    Object.keys(autoCache).forEach(k => delete autoCache[k]);
    if (!selecionado || !indicadores.some(i => i.id === selecionado)) selecionado = indicadores[0]?.id || null;
    render();
  }

  // ---------- telas ----------
  function render() {
    if (MODO === 'dashboard') return renderDashboard();
    renderLancamento();
    renderTabela();
    renderGrafico();
  }

  function renderLancamento() {
    const box = $('#lancamento');
    if (!canEdit) { box.innerHTML = `<p class="muted">Você pode consultar os indicadores de ${esc(NOME_AREA)}, mas não lançar valores.</p>`; return; }
    const manuais = indicadores.filter(i => i.tipo !== 'formula');
    const formulas = indicadores.filter(i => i.tipo === 'formula');
    box.innerHTML = `
      <div class="lanc-head">
        <label class="field"><span>Mês do lançamento</span><input class="input" type="month" id="mes-lanc" value="${mesLanc}"></label>
        <p class="muted small">Campos com <span class="auto-dot"></span> são preenchidos pelo sistema. Deixe em branco para usar o valor calculado ou digite para corrigir.</p>
      </div>
      <form class="form-grid lanc-grid" id="form-lanc">
        ${manuais.map(i => {
          const auto = i.tipo === 'auto' && !antesDoInicio(mesLanc) ? valorAuto(i, mesLanc) : null;
          const v = lancados[mesLanc]?.[i.id];
          return `<label class="field"><span>${i.tipo === 'auto' ? '<span class="auto-dot" title="Calculado pelo sistema"></span>' : ''}${esc(i.nome)}</span>
            <div class="affix">${i.unidade === 'moeda' ? '<span>R$</span>' : ''}
              <input class="input" type="number" step="any" inputmode="decimal" name="${esc(i.id)}" value="${isBlank(v) ? '' : v}"
                placeholder="${auto === null ? '' : String(Math.round(auto * 100) / 100).replace('.', ',')}">
              ${['pct', 'm2', 'dias'].includes(i.unidade) ? `<span>${UNIDADES[i.unidade]}</span>` : ''}</div>
            <small class="muted">${i.tipo === 'auto' ? `Sistema: ${fmtU(i.unidade, auto)}` : ''}${!isBlank(i.meta) ? `${i.tipo === 'auto' ? ' · ' : ''}Meta: ${fmtU(i.unidade, i.meta)}` : ''}</small></label>`;
        }).join('')}
      </form>
      ${formulas.length ? `<div class="lanc-calc"><span class="muted small">Calculados:</span><span id="calc-prev"></span></div>` : ''}
      <div class="row lanc-foot"><span class="muted small" id="lanc-info">${lancados[mesLanc] ? 'Mês já tem lançamento salvo' : 'Mês ainda sem lançamento'}</span>
        <span class="spacer"></span><button class="btn primary" id="salvar-lanc">Salvar ${fmt.month(mesLanc)}</button></div>`;
    $('#mes-lanc').addEventListener('change', e => { if (e.target.value) { mesLanc = e.target.value; renderLancamento(); } });
    const form = $('#form-lanc');
    const prever = () => {
      const el = $('#calc-prev');
      if (!el) return;
      const antes = lancados[mesLanc];
      lancados[mesLanc] = { ...(antes || {}), ...lerForm(form) };
      el.innerHTML = formulas.map(i => `<span class="calc-chip">${esc(i.nome)}: <b>${fmtU(i.unidade, valor(i.id, mesLanc))}</b></span>`).join('');
      if (antes) lancados[mesLanc] = antes; else delete lancados[mesLanc];
    };
    form.addEventListener('input', prever);
    prever();
    $('#salvar-lanc').addEventListener('click', async e => {
      e.target.disabled = true;
      try {
        const valores = Object.fromEntries(Object.entries(lerForm(form)).filter(([, v]) => v !== null));
        await Store.save(tabela, { id: mesLanc, mes: mesLanc, valores, por: Store.getSession()?.email || null });
        lancados[mesLanc] = valores;
        toast(`Indicadores de ${fmt.month(mesLanc)} salvos`, 'ok');
        if (mesLanc.slice(0, 4) !== String(ano)) { ano = Number(mesLanc.slice(0, 4)); $('#ano').value = ano; }
        render();
      } catch (err) { toast(err.message, 'error'); }
      finally { e.target.disabled = false; }
    });
  }
  const lerForm = form => Object.fromEntries(indicadores.filter(i => i.tipo !== 'formula')
    .map(i => [i.id, parse.num(form.elements[i.id]?.value)]));

  function renderTabela() {
    const meses = mesesDoAno(ano);
    $('#tabela').innerHTML = `
      <thead><tr><th class="sticky">Indicador</th><th class="num">Meta</th>
        ${meses.map(m => `<th class="num mes ${m === mesLanc ? 'on' : ''}" data-mes="${m}" title="${canEdit ? 'Lançar este mês' : ''}">${MESES[+m.slice(5) - 1]}</th>`).join('')}
        <th class="num">${ano}</th></tr></thead>
      <tbody>${indicadores.map(i => {
        const erro = compiladas[i.id]?.erro;
        const total = valor(i.id, 'ANO:' + ano);
        const corTotal = i.tipo === 'formula' || agregacaoPadrao(i) !== 'soma';
        return `<tr data-id="${esc(i.id)}" class="${i.id === selecionado ? 'sel' : ''}">
          <td class="sticky"><span class="ind-nome">${esc(i.nome)}</span>
            <span class="ind-tipo">${i.tipo === 'formula' ? `= ${esc(i.formula)}` : i.tipo === 'auto' ? 'automático' : 'manual'}</span>
            ${erro ? `<span class="ind-erro">${esc(erro)}</span>` : ''}</td>
          <td class="num muted">${isBlank(i.meta) ? '—' : fmtU(i.unidade, i.meta)}${i.melhor && !isBlank(i.meta) ? (i.melhor === 'maior' ? ' ↑' : ' ↓') : ''}</td>
          ${meses.map(m => {
            if (antesDoInicio(m)) return '<td class="num muted" title="Antes do início dos indicadores">·</td>';
            const v = mesFuturo(m) ? null : valor(i.id, m);
            const st = statusMeta(i, v);
            return `<td class="num ${st} ${origem(i, m)}" title="${st === 'hit' ? 'Meta atingida' : st === 'miss' ? 'Abaixo da meta' : ''}${origem(i, m) ? ' · calculado pelo sistema' : ''}">${v === null ? '<span class="muted">—</span>' : fmtU(i.unidade, v)}</td>`;
          }).join('')}
          <td class="num total ${corTotal ? statusMeta(i, total) : ''}">${fmtU(i.unidade, total)}</td></tr>`;
      }).join('')}</tbody>`;
    $$('#tabela tbody tr').forEach(tr => tr.addEventListener('click', () => { selecionado = tr.dataset.id; renderTabela(); renderGrafico(); }));
    if (canEdit) $$('#tabela th.mes').forEach(th => th.addEventListener('click', () => {
      mesLanc = th.dataset.mes; renderLancamento(); renderTabela();
      $('#lancamento').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function renderGrafico() {
    const i = indicadores.find(x => x.id === selecionado);
    if (!i) return;
    const meses = mesesDoAno(ano);
    $('#graf-titulo').textContent = `${i.nome} em ${ano}`;
    $('#graf-sub').textContent = i.tipo === 'auto' ? `Automático: ${FONTES[i.fonte]?.nome || i.fonte}` : i.tipo === 'formula' ? `Fórmula: ${i.formula}` : 'Lançado pela equipe';
    const ds = [{ label: i.nome, data: meses.map(m => mesFuturo(m) ? null : valor(i.id, m)) }];
    if (!isBlank(i.meta)) ds.push({ type: 'line', label: 'Meta', data: meses.map(() => i.meta), borderColor: Dash.css('--muted'),
      backgroundColor: 'transparent', borderDash: [5, 4], borderWidth: 2, pointRadius: 0, pointHitRadius: 0 });
    Dash.bar('grafico', {
      labels: meses.map(m => MESES[+m.slice(5) - 1]), money: i.unidade === 'moeda',
      suffix: i.unidade === 'pct' ? '%' : i.unidade === 'm2' ? ' m²' : i.unidade === 'dias' ? ' d' : '',
      datasets: ds,
    });
  }

  // ---------- gerenciar indicadores ----------
  function gerenciar() {
    let lista = structuredClone(indicadores);
    const fontesArea = Object.entries(FONTES).filter(([, f]) => f.tabelas.every(t => Store.podeLer(t)));
    const opt = (pares, cur) => pares.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const dlg = openModal({
      title: `Indicadores de ${NOME_AREA}`,
      wide: true,
      body: `<p class="small">Use o <b>código</b> dos indicadores nas fórmulas, com <code>+ - * / ( )</code>. Ex.: <code>investimento / leads</code>.
        A meta vale para cada mês; ↑ = quanto maior melhor, ↓ = quanto menor melhor.</p>
        <div class="table-wrap"><table class="data static ger"><thead><tr><th></th><th>Nome</th><th>Código</th><th>Unidade</th><th>Tipo</th>
          <th>Fórmula / origem</th><th>Meta</th><th>Melhor</th><th>No ano</th><th></th></tr></thead><tbody></tbody></table></div>
        <label class="field ger-inicio"><span>Indicadores a partir de</span><input class="input" type="month" id="ger-inicio" value="${esc(inicio || '')}">
          <small class="muted">Meses anteriores ficam zerados. Deixe em branco para mostrar todo o histórico.</small></label>
        <div class="row"><button class="btn ghost small" id="ger-add">+ Adicionar indicador</button><span class="spacer"></span>
          <button class="btn ghost small" id="ger-padrao">Restaurar lista padrão</button></div>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost' },
        { label: 'Salvar', cls: 'primary', onClick: async () => {
          const ids = lista.map(i => i.id);
          if (lista.some(i => !i.nome?.trim())) throw new Error('Todo indicador precisa de um nome');
          if (new Set(ids).size !== ids.length) throw new Error('Há dois indicadores com o mesmo código');
          for (const i of lista.filter(x => x.tipo === 'formula')) {
            try { compilar(i.formula, ids); } catch (e) { throw new Error(`${i.nome}: ${e.message}`); }
          }
          await Store.save(tabela, { id: '_config', indicadores: lista, inicio: $('#ger-inicio', dlg).value || '' });
          toast('Indicadores salvos', 'ok');
          await carregar();
        } },
      ],
    });
    const tbody = $('tbody', dlg);
    function desenhar() {
      tbody.innerHTML = lista.map((i, k) => `<tr data-k="${k}">
        <td class="nowrap"><button class="icon-btn small" data-mv="-1" ${k === 0 ? 'disabled' : ''} title="Subir">↑</button><button class="icon-btn small" data-mv="1" ${k === lista.length - 1 ? 'disabled' : ''} title="Descer">↓</button></td>
        <td><input class="input" data-f="nome" value="${esc(i.nome)}" style="min-width:170px"></td>
        <td><code>${esc(i.id)}</code></td>
        <td><select class="input" data-f="unidade">${opt(Object.entries(UNIDADES), i.unidade)}</select></td>
        <td><select class="input" data-f="tipo">${opt([['manual', 'Manual'], ['auto', 'Automático'], ['formula', 'Fórmula']], i.tipo)}</select></td>
        <td>${i.tipo === 'formula' ? `<input class="input mono" data-f="formula" value="${esc(i.formula || '')}" placeholder="ex.: investimento / leads" style="min-width:200px">`
          : i.tipo === 'auto' ? `<select class="input" data-f="fonte" style="max-width:260px">${opt([['', 'Escolha…'], ...fontesArea.map(([k, f]) => [k, f.nome])], i.fonte)}</select>`
          : '<span class="muted small">Lançado pela equipe</span>'}</td>
        <td><input class="input" data-f="meta" type="number" step="any" value="${isBlank(i.meta) ? '' : i.meta}" style="width:110px"></td>
        <td><select class="input" data-f="melhor">${opt([['maior', '↑ maior'], ['menor', '↓ menor'], ['', '—']], i.melhor || '')}</select></td>
        <td><select class="input" data-f="agregacao">${opt([['', 'Padrão'], ['soma', 'Soma'], ['media', 'Média'], ['ultimo', 'Último mês']], i.agregacao || '')}</select></td>
        <td><button class="icon-btn small" data-rm title="Remover">×</button></td></tr>`).join('');
      $$('[data-f]', tbody).forEach(el => el.addEventListener('change', () => {
        const i = lista[el.closest('tr').dataset.k], f = el.dataset.f;
        i[f] = f === 'meta' ? parse.num(el.value) : el.value;
        if (f === 'tipo') desenhar();
      }));
      $$('[data-mv]', tbody).forEach(b => b.addEventListener('click', () => {
        const k = +b.closest('tr').dataset.k, j = k + +b.dataset.mv;
        [lista[k], lista[j]] = [lista[j], lista[k]];
        desenhar();
      }));
      $$('[data-rm]', tbody).forEach(b => b.addEventListener('click', () => {
        const i = lista[b.closest('tr').dataset.k];
        const usado = lista.filter(x => x.tipo === 'formula' && compiladas[x.id]?.refs?.includes(i.id));
        if (!confirm(`Remover "${i.nome}"?${usado.length ? `\nAtenção: ele é usado na fórmula de ${usado.map(x => x.nome).join(', ')}.` : ''}\nOs valores já lançados continuam guardados.`)) return;
        lista.splice(+b.closest('tr').dataset.k, 1);
        desenhar();
      }));
    }
    $('#ger-add', dlg).addEventListener('click', () => {
      const nome = prompt('Nome do novo indicador:');
      if (!nome?.trim()) return;
      let base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'indicador';
      if (/^\d/.test(base)) base = 'i_' + base;
      let id = base, n = 2;
      while (lista.some(i => i.id === id)) id = `${base}_${n++}`;
      lista.push(ind(id, nome.trim(), 'numero', 'manual'));
      desenhar();
    });
    $('#ger-padrao', dlg).addEventListener('click', () => {
      if (confirm('Voltar para a lista padrão de indicadores? Metas e indicadores criados por vocês serão descartados (os valores lançados continuam guardados).')) {
        lista = structuredClone(PADRAO[AREA]); desenhar();
      }
    });
    desenhar();
  }

  // ---------- dashboard (dashboard-mkt.html) ----------
  let periodoDash = dates.today().slice(0, 7);
  const canal = d => (d.fonte || '').trim() || 'Sem fonte';
  function mesesDoPeriodo(periodo) {
    const meses = periodo.startsWith('ANO:') ? mesesDoAno(periodo.slice(4)) : [periodo];
    return meses.filter(m => !mesFuturo(m) && !antesDoInicio(m));
  }
  function opcoesPeriodo() {
    const hoje = dates.today().slice(0, 7);
    const ini = inicio && inicio <= hoje ? inicio : hoje;
    const meses = dates.monthRange(ini, hoje).reverse();
    const anos = [...new Set(meses.map(m => m.slice(0, 4)))];
    if (!meses.includes(periodoDash) && !anos.some(a => periodoDash === 'ANO:' + a)) periodoDash = hoje;
    $('#periodo').innerHTML = meses.map(m => `<option value="${m}" ${m === periodoDash ? 'selected' : ''}>${fmt.month(m)}</option>`).join('')
      + anos.map(a => `<option value="ANO:${a}" ${'ANO:' + a === periodoDash ? 'selected' : ''}>Acumulado de ${a}</option>`).join('');
  }
  function kpi(id, label, sub) {
    const i = indicadores.find(x => x.id === id);
    if (!i) return null;
    const v = valor(id, periodoDash);
    const st = statusMeta(i, v);
    let falta = '';
    if (v === null) {
      const fs = i.tipo === 'formula' ? folhas(id).filter(f => indicadores.find(x => x.id === f)?.tipo === 'manual') : i.tipo === 'manual' ? [id] : [];
      falta = fs.length ? 'Aguardando lançamento em Indicadores' : 'Sem dados no período';
    }
    return {
      label: label || i.nome,
      value: `<span class="${st === 'hit' ? 'good' : st === 'miss' ? 'bad' : ''}">${fmtU(i.unidade, v)}</span>`,
      sub: falta || [sub, !isBlank(i.meta) ? `Meta: ${fmtU(i.unidade, i.meta)}` : ''].filter(Boolean).join(' · '),
    };
  }
  const kpisDe = (el, lista) => Dash.kpis(el, lista.map(a => kpi(...a)).filter(Boolean));

  function renderDashboard() {
    opcoesPeriodo();
    const meses = mesesDoPeriodo(periodoDash);
    $('#f-info').textContent = meses.length ? `${fmt.month(meses[0])}${meses.length > 1 ? ' a ' + fmt.month(meses[meses.length - 1]) : ''}` : '';
    kpisDe('#k-funil', [
      ['visitantes', 'Visitantes', 'no formulário'],
      ['leads', 'Leads', 'todos os canais, exceto prospecção ativa'],
      ['conv_visitante', 'Conversão visitante → lead', 'leads do formulário ÷ visitantes'],
      ['vendas', 'Vendas', 'negócios fechados'],
      ['taxa_conversao', 'Taxa de conversão', 'vendas ÷ leads'],
    ]);
    kpisDe('#k-midia', [
      ['investimento', 'Investimento'],
      ['cpl', 'Custo por lead (CPL)'],
      ['cpc', 'CPC', 'custo por clique'],
      ['cpa', 'CPA', 'custo por venda'],
      ['cpm', 'CPM', 'custo por mil impressões'],
      ['taxa_retorno', 'Taxa de retorno (ROI)', 'receita das vendas − investimento'],
    ]);
    kpisDe('#k-email', [
      ['taxa_abertura', 'Taxa de abertura', 'abertos ÷ entregues'],
      ['taxa_cliques', 'Taxa de cliques', 'cliques ÷ entregues'],
      ['ctor', 'CTOR', 'cliques ÷ abertos'],
    ]);

    // leads por canal (todas as fontes do CRM, inclusive prospecção ativa, para comparação)
    const noPeriodo = d => meses.includes(dates.ym(d.criado_em));
    const fechouNoPeriodo = d => meses.some(m => fechouEm(d, m));
    const canais = {};
    D.crm.forEach(d => {
      const c = canal(d);
      const lin = canais[c] ||= { canal: c, leads: 0, vendas: 0, receita: 0, mkt: ehMkt(d) };
      if (noPeriodo(d)) lin.leads++;
      if (fechouNoPeriodo(d)) { lin.vendas++; lin.receita += Number(d.valor_total) || 0; }
    });
    const linhas = Object.values(canais).filter(l => l.leads || l.vendas).sort((a, b) => b.leads - a.leads || b.vendas - a.vendas);
    Dash.bar('c-canais', { labels: linhas.map(l => l.canal), horizontal: true,
      datasets: [{ label: 'Leads', data: linhas.map(l => l.leads) }] });
    $('#c-canais').parentElement.style.height = Math.max(220, linhas.length * 34 + 60) + 'px';
    $('#t-canais').innerHTML = linhas.map(l => `<tr><td>${esc(l.canal)}${l.mkt ? '' : ' <span class="tag">não entra nos leads de MKT</span>'}</td>
      <td class="num">${fmt.num(l.leads, 0)}</td><td class="num">${fmt.num(l.vendas, 0)}</td>
      <td class="num">${l.leads ? fmt.pct(Math.round(l.vendas / l.leads * 1000) / 10) : '—'}</td><td class="num">${fmt.money(l.receita)}</td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">Nenhum lead no período.</td></tr>';

    // evolução mensal dos leads por canal
    const hoje = dates.today().slice(0, 7);
    const ini = inicio && inicio <= hoje ? inicio : (desdeCrm(D) || hoje);
    const todos = dates.monthRange(ini, hoje);
    const top = linhas.slice(0, 6).map(l => l.canal);
    const cores = ['--series-1', '--series-2', '--series-3', '--series-4', '--accent', '--brand'].map(Dash.css);
    const series = top.map((c, k) => ({ label: c, color: cores[k], data: todos.map(m => D.crm.filter(d => canal(d) === c && dates.ym(d.criado_em) === m).length) }));
    const outros = todos.map(m => D.crm.filter(d => !top.includes(canal(d)) && dates.ym(d.criado_em) === m).length);
    if (outros.some(Boolean)) series.push({ label: 'Outros', color: Dash.css('--muted'), data: outros });
    Dash.bar('c-evolucao', { labels: todos.map(fmt.month), stacked: true, datasets: series.length ? series : [{ label: 'Leads', data: todos.map(() => 0) }] });
  }

  // ---------- início ----------
  if (MODO === 'dashboard') {
    $('#periodo').addEventListener('change', e => { periodoDash = e.target.value; renderDashboard(); });
    Dash.onThemeChange(renderDashboard);
    carregar();
    return;
  }
  $('#area-nome').textContent = NOME_AREA;
  document.title = `Indicadores ${NOME_AREA} · Órion`;
  const anoAtual = Number(dates.today().slice(0, 4));
  $('#ano').innerHTML = Array.from({ length: 4 }, (_, k) => anoAtual + 1 - k).map(a => `<option ${a === ano ? 'selected' : ''}>${a}</option>`).join('');
  $('#ano').addEventListener('change', e => { ano = Number(e.target.value); renderTabela(); renderGrafico(); });
  if (canEdit) $('#gerenciar').addEventListener('click', gerenciar); else $('#gerenciar').remove();
  Dash.onThemeChange(renderGrafico);
  carregar();
})();
