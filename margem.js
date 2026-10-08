// Calculadora de margem por plano (somente administradores: tabela 'margem', área 'admin').
// Cada cenário (ex.: "DS · HUB1") guarda as premissas globais e os planos:
//   premissas: custo total ÷ base de rateio = custo unitário (o unitário nunca é digitado direto)
//   planos: bases do plano (venda, pedidos, SKUs, estrutura) e receita (mensalidade, % variável, R$ por pedido)
// Fórmulas por plano:
//   receita variável = venda × alíquota% + pedidos × valor por pedido      receita bruta = mensalidade + variável
//   imposto = bruta × alíquota%                                             receita líquida = bruta − imposto
//   CSP = aluguel e energia do freezer × freezers + energia do microondas × pedidos (planos com microondas) + software × CNPJs
//   mão de obra = custo/pedido × pedidos       ocupação = custo/m² × m²
//   lucro bruto = líquida − CSP − mão de obra − ocupação                    margem bruta = lucro bruto ÷ bruta
//   comissão = mensalidade × alíquota%         margem de contribuição = lucro bruto − comissão (÷ bruta)
(() => {
  if (window.SEM_ACESSO) return;

  const TABELA = 'margem';
  const canEdit = Store.podeEditar(TABELA);

  // ---------- premissas (padrão dos prints) ----------
  const PREMISSAS = [
    { secao: 'Impostos sobre receita', itens: [
      { k: 'imposto', nome: 'Imposto', conta: 'Impostos', nota: 'Alíquota efetiva sobre faturamento bruto (Simples Nacional)', tipo: 'pct', label: 'Alíquota (% sobre faturamento)', padrao: { pct: 15 } },
    ] },
    { secao: 'Custos dos serviços prestados', itens: [
      { k: 'aluguel_freezer', nome: 'Aluguel de equipamentos (freezer)', conta: 'Custo de Aluguel de Equipamentos Dark Store', nota: 'Custo total do aluguel dividido pelo nº de freezers', base: 'freezer', padrao: { total: 180, base: 1 } },
      { k: 'energia_freezer', nome: 'Energia do freezer', conta: 'Custo de Energia Dark Store', nota: 'Conta de energia atribuída ao freezer ÷ nº de freezers', base: 'freezer', padrao: { total: 5638, base: 29 } },
      { k: 'energia_micro', nome: 'Energia do microondas', conta: 'Custo de Energia Dark Store', nota: 'Consumo por pedido aquecido', base: 'pedido', padrao: { total: 0.13, base: 1 } },
      { k: 'software', nome: 'Software / Licença DS', conta: 'Software / Licença de Uso – DS', nota: 'Licença mensal por CNPJ ativo', base: 'cnpj', padrao: { total: 29, base: 1 } },
    ] },
    { secao: 'Custos com mão de obra operacional', itens: [
      { k: 'mao_obra', nome: 'Mão de obra operacional', conta: 'Custo com Pessoal Operacional (grupo completo 2600–5100)',
        nota: 'Folha operacional completa (salários + encargos + benefícios) × fração DS ÷ pedidos DS/mês — ≈ R$ 2,55/ped (retrato 6M com maturação, alinhado à premissa oficial)',
        base: 'pedido', padrao: { total: 28050, base: 11000 } },
    ] },
    { secao: 'Custos de ocupação', itens: [
      { k: 'ocupacao', nome: 'Ocupação (m²)', conta: 'Custos com Ocupação (grupo completo 5100–6700)',
        nota: 'Ocupação completa (aluguel + IPTU + condomínio + energia + telefonia + limpeza + manutenção…) × 1/3 DS ÷ m² DS — ≈ R$ 283/m² (retrato 6M, alinhado à premissa oficial; era só-aluguel 5451)',
        base: 'm²', padrao: { total: 7862.35, base: 27.75 } },
    ] },
    { secao: 'Custo comercial', itens: [
      { k: 'comissao', nome: 'Comissão', conta: 'Comissões', nota: 'Alíquota da comissão comercial sobre a mensalidade', tipo: 'pct', label: 'Alíquota (% sobre mensalidade)', padrao: { pct: 5 } },
    ] },
  ];
  const premissasPadrao = () => Object.fromEntries(PREMISSAS.flatMap(s => s.itens).map(i => [i.k, { ...i.padrao }]));
  const plano = (nome, venda, pedidos, skus, mensalidade, aliq, vpp, freezers, microondas, m2) =>
    ({ id: Store.uid(), nome, venda, pedidos, skus, mensalidade, aliq, vpp, freezers, microondas, m2, cnpjs: 1 });
  const planosPadrao = () => [
    plano('1/4 Freezer (35 cm)', 5450, 122, 15, 890, 8, 1.1, 0.25, 0, 0.25),
    plano('1/2 Freezer (70 cm)', 8605, 237, 20, 1290, 8, 1.1, 0.5, 0, 0.5),
    plano('1 Freezer Inteiro (140 cm)', 21712.5, 456, 25, 1890, 8, 1.1, 1, 0, 1),
    plano('1 m² sem Freezer', 21712.5, 456, 25, 1390, 8, 1.1, 0, 0, 1),
    plano('1 Freezer + 2 Microondas', 40245, 1190, 25, 2610, 10, 1.1, 1, 2, 2),
  ];
  const cenarioPadrao = () => ({ id: 'c_' + Store.uid(), nome: 'DS · HUB1', premissas: premissasPadrao(), planos: planosPadrao(), criado_em: new Date().toISOString() });

  // ---------- estado ----------
  let cenarios = [];
  let atual = null;
  let timer = null;

  // ---------- formatação ----------
  const n = v => Number(v) || 0;
  const brl = v => n(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const neg = v => `−${brl(Math.abs(v))}`;            // custos aparecem como "−R$ 45,00"
  const pct1 = v => isFinite(v) ? (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : '—';
  const pct2 = v => n(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  const numIn = v => isBlank(v) ? '' : String(v).replace('.', ',');
  const unit = k => { const p = atual.premissas[k] || {}; return n(p.base) ? n(p.total) / n(p.base) : 0; };

  function calcular(p) {
    const imp = n(atual.premissas.imposto?.pct) / 100, com = n(atual.premissas.comissao?.pct) / 100;
    const ticket = n(p.pedidos) ? n(p.venda) / n(p.pedidos) : 0;
    const recVar = n(p.venda) * n(p.aliq) / 100 + n(p.pedidos) * n(p.vpp);
    const bruta = n(p.mensalidade) + recVar;
    const imposto = bruta * imp;
    const liquida = bruta - imposto;
    const aluguel = unit('aluguel_freezer') * n(p.freezers);
    const energia = unit('energia_freezer') * n(p.freezers);
    const micro = n(p.microondas) > 0 ? unit('energia_micro') * n(p.pedidos) : 0;
    const software = unit('software') * n(p.cnpjs);
    const csp = aluguel + energia + micro + software;
    const mo = unit('mao_obra') * n(p.pedidos);
    const ocup = unit('ocupacao') * n(p.m2);
    const lucro = liquida - csp - mo - ocup;
    const comissao = n(p.mensalidade) * com;
    const mc = lucro - comissao;
    return { ticket, recVar, bruta, imposto, liquida, aluguel, energia, micro, software, csp, mo, ocup, lucro, mb: bruta ? lucro / bruta : NaN, comissao, mc, mcp: bruta ? mc / bruta : NaN };
  }

  // ---------- telas ----------
  // três abas: Calcular (escolhe um plano e vê a margem dele), Comparar planos (tabela) e Premissas
  let aba = (() => { try { return localStorage.getItem('gh_margem_aba') || 'calc'; } catch { return 'calc'; } })();
  let planoSel = null;
  let freezerOutro = false;

  function render() {
    $('#cenario').innerHTML = cenarios.map(c => `<option value="${esc(c.id)}" ${c.id === atual.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
    $$('.mg-aba').forEach(b => { const on = b.dataset.aba === aba; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    if (aba === 'premissas') renderPremissas();
    else if (aba === 'comparar') renderComparar();
    else renderCalc();
  }

  // ----- aba Calcular -----
  const FREEZER_OPC = [[0, 'Sem freezer'], [0.25, '¼ freezer'], [0.5, '½ freezer'], [1, 'Freezer inteiro']];
  function renderCalc() {
    if (!atual.planos.some(x => x.id === planoSel)) planoSel = atual.planos[0]?.id;
    const p = atual.planos.find(x => x.id === planoSel);
    const dis = canEdit ? '' : 'disabled';
    const campo = (f, label, ajuda = '', pre = '', suf = '') => `<label class="mg-f"><span>${label}</span>
      <div class="affix">${pre ? `<span>${pre}</span>` : ''}<input class="input" data-f="${f}" inputmode="decimal" value="${numIn(p[f])}" ${dis}>${suf ? `<span>${suf}</span>` : ''}</div>
      ${ajuda ? `<small>${ajuda}</small>` : ''}</label>`;
    const outro = freezerOutro || !FREEZER_OPC.some(([v]) => v === n(p.freezers));
    $('#mg-conteudo').innerHTML = `
      <section class="card mg-escolha">
        <h2>O que você está calculando?</h2>
        <p class="muted">Escolha um plano para ver quanto sobra dele por mês. Mude qualquer número e o resultado se atualiza na hora.</p>
        <div class="mg-chips" role="radiogroup" aria-label="Plano">${atual.planos.map(x => `<button type="button" role="radio" aria-checked="${x.id === p.id}"
          class="mg-chip ${x.id === p.id ? 'on' : ''}" data-sel="${esc(x.id)}">${esc(x.nome)}</button>`).join('')}
          ${canEdit ? '<button type="button" class="mg-chip novo" id="mg-novo">+ Novo plano</button>' : ''}</div>
      </section>
      <div class="mg-calc">
        <div class="mg-form">
          <section class="card mg-bloco"><h3>📦 Plano</h3>
            <label class="mg-f"><span>Nome do plano</span><input class="input" data-f="nome" value="${esc(p.nome)}" ${dis}></label></section>
          <section class="card mg-bloco"><h3>🛍️ Sobre o cliente</h3>
            <div class="mg-grid">
              ${campo('venda', 'Quanto ele vende por mês', 'Venda média do cliente', 'R$')}
              ${campo('pedidos', 'Quantos pedidos por mês')}
              <div class="mg-f"><span>Ticket médio</span><b class="mg-ticket" data-out="ticket"></b><small>venda ÷ pedidos</small></div>
              ${campo('skus', 'Produtos (SKUs) no plano', 'Informativo: não muda a conta')}
            </div></section>
          <section class="card mg-bloco"><h3>🧊 Espaço e equipamentos</h3>
            <div class="mg-f"><span>Freezer</span>
              <div class="mg-seg" role="radiogroup" aria-label="Freezer">${FREEZER_OPC.map(([v, l]) => `<button type="button" role="radio" data-freezer="${v}"
                aria-checked="${!outro && n(p.freezers) === v}" class="${!outro && n(p.freezers) === v ? 'on' : ''}" ${dis}>${l}</button>`).join('')}
                <button type="button" role="radio" data-freezer="outro" aria-checked="${outro}" class="${outro ? 'on' : ''}" ${dis}>Outro</button></div>
              ${outro ? `<div class="mg-outro">${campo('freezers', 'Fração de freezer', 'Ex.: 0,75 = três quartos de um freezer')}</div>` : ''}
            </div>
            <div class="mg-grid">
              ${campo('microondas', 'Microondas', 'Com microondas, a energia é cobrada por pedido', '', 'un.')}
              ${campo('m2', 'Área ocupada', 'Base do custo de ocupação', '', 'm²')}
              ${campo('cnpjs', 'CNPJs', 'Licença de software por CNPJ')}
            </div></section>
          <section class="card mg-bloco"><h3>💰 Quanto cobramos</h3>
            <div class="mg-grid">
              ${campo('mensalidade', 'Mensalidade fixa', '', 'R$')}
              ${campo('aliq', 'Percentual sobre as vendas', '', '', '%')}
              ${campo('vpp', 'Valor por pedido', '', 'R$')}
            </div></section>
          ${canEdit && atual.planos.length > 1 ? '<button class="btn ghost small danger mg-excluir" id="mg-excluir-plano">Excluir este plano</button>' : ''}
        </div>
        <aside class="card mg-result" id="mg-result" aria-live="polite"></aside>
      </div>`;
    atualizarCalc();
    ligarCalc(p);
  }

  function atualizarCalc() {
    const p = atual.planos.find(x => x.id === planoSel);
    if (!p || !$('#mg-result')) return;
    const r = calcular(p);
    const t = $('[data-out="ticket"]'); if (t) t.textContent = brl(r.ticket);
    const parte = v => r.bruta ? v / r.bruta : 0;
    const larg = v => Math.max(0, Math.min(100, parte(v) * 100)).toFixed(1);
    const custos = [
      ['🧾', 'Impostos', r.imposto, 'Simples Nacional sobre a receita bruta'],
      ['🧊', 'Equipamentos, energia e software', r.csp, 'Freezer, microondas e licença'],
      ['👥', 'Mão de obra operacional', r.mo, `${brl(unit('mao_obra'))} por pedido`],
      ['🏢', 'Ocupação do espaço', r.ocup, `${brl(unit('ocupacao'))} por m²`],
      ['🤝', 'Comissão comercial', r.comissao, `${pct2(atual.premissas.comissao?.pct)} da mensalidade`],
    ];
    const de100 = r.bruta ? (r.mcp * 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null;
    $('#mg-result').innerHTML = `
      <div class="mg-hero ${r.mc < 0 ? 'neg' : ''}">
        <span>Margem de contribuição</span>
        <b>${pct1(r.mcp)}</b>
        <small>${brl(r.mc)} por mês</small>
      </div>
      ${de100 ? `<p class="mg-frase">De cada <b>R$ 100</b> que o cliente paga, sobram <b>${de100}</b> depois de todos os custos.</p>` : ''}
      <div class="mg-sub">
        <div><span>Receita bruta</span><b>${brl(r.bruta)}</b><small>${brl(p.mensalidade)} fixos + ${brl(r.recVar)} variáveis</small></div>
        <div><span>Margem bruta</span><b>${pct1(r.mb)}</b><small>${brl(r.lucro)} antes da comissão</small></div>
      </div>
      <h4>Para onde vai a receita</h4>
      <ul class="mg-barras">
        ${custos.map(([ic, l, v, obs]) => `<li><div class="mg-bl"><span>${ic} ${l}</span><b>−${brl(v)}</b></div>
          <div class="mg-track"><span style="width:${larg(v)}%"></span></div><small>${pct1(parte(v))} da receita · ${obs}</small></li>`).join('')}
        <li class="sobra"><div class="mg-bl"><span>✅ Sobra (margem de contribuição)</span><b>${brl(r.mc)}</b></div>
          <div class="mg-track"><span style="width:${larg(r.mc)}%"></span></div><small>${pct1(r.mcp)} da receita</small></li>
      </ul>
      <details class="mg-conta"><summary>Ver a conta completa</summary>
        <table>${LINHAS.filter(l => l.secao || (l.calc && l.label !== 'Ticket médio por pedido')).map(l => l.secao
          ? `<tr class="sec"><th colspan="2">${esc(l.secao)}</th></tr>`
          : `<tr class="${l.destaque ? 'dest' : ''}"><td>${esc(l.label)}</td><td>${l.calc(r)}</td></tr>`).join('').replace(/<tr class="sec"><th colspan="2">Bases do plano<\/th><\/tr>/, '')}</table>
      </details>`;
  }

  function ligarCalc(p) {
    $$('.mg-chip[data-sel]').forEach(b => b.addEventListener('click', () => { planoSel = b.dataset.sel; freezerOutro = false; renderCalc(); }));
    $('#mg-novo')?.addEventListener('click', () => {
      const novo = { ...structuredClone(p), id: Store.uid(), nome: 'Novo plano' };
      atual.planos.push(novo); planoSel = novo.id; freezerOutro = false;
      renderCalc(); salvar(true);
      const i = $('[data-f="nome"]'); i?.focus(); i?.select();
    });
    $('#mg-excluir-plano')?.addEventListener('click', () => {
      if (!confirm(`Excluir o plano "${p.nome}"?`)) return;
      atual.planos = atual.planos.filter(x => x.id !== p.id); planoSel = atual.planos[0]?.id;
      renderCalc(); salvar(true);
    });
    $$('.mg-form [data-f]').forEach(i => i.addEventListener('input', () => {
      p[i.dataset.f] = i.dataset.f === 'nome' ? i.value : parse.num(i.value);
      if (i.dataset.f === 'nome') { const c = $(`.mg-chip[data-sel="${CSS.escape(p.id)}"]`); if (c) c.textContent = i.value || 'Sem nome'; }
      atualizarCalc(); salvar();
    }));
    $$('[data-freezer]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.freezer === 'outro') freezerOutro = true;
      else { freezerOutro = false; p.freezers = Number(b.dataset.freezer); salvar(); }
      renderCalc();
      if (freezerOutro) $('[data-f="freezers"]')?.focus();
    }));
  }

  // ----- aba Premissas -----
  function renderPremissas() {
    const dis = canEdit ? '' : 'disabled';
    $('#mg-conteudo').innerHTML = `
      <section class="card mg-intro">
        <div><h2>Premissas — <span>${esc(atual.nome)}</span></h2>
          <p>Os custos que valem para todos os planos deste cenário. Você informa o <b>custo total</b> e a <b>base de rateio</b>
          (por exemplo, a conta de energia e o número de freezers), e o sistema calcula o custo unitário.</p></div>
        ${canEdit ? '<button class="btn ghost small" id="restaurar">Restaurar padrão</button>' : ''}
      </section>
      ${PREMISSAS.map(s => `<section class="card mg-sec">
        <h3 class="mg-sec-tit">${esc(s.secao)}</h3>
        ${s.itens.map(i => {
          const v = atual.premissas[i.k] || {};
          const campos = i.tipo === 'pct'
            ? `<label class="mg-campo mg-largo"><span>${esc(i.label)}</span><div class="affix"><input class="input" data-p="${i.k}" data-c="pct" inputmode="decimal" value="${numIn(v.pct)}" ${dis}><span>%</span></div></label>`
            : `<label class="mg-campo"><span>Custo total</span><div class="affix"><span>R$</span><input class="input" data-p="${i.k}" data-c="total" inputmode="decimal" value="${numIn(v.total)}" ${dis}></div></label>
               <label class="mg-campo"><span>Dividido por (${esc(i.base)})</span><input class="input" data-p="${i.k}" data-c="base" inputmode="decimal" value="${numIn(v.base)}" ${dis}></label>`;
          return `<div class="mg-item">
            <div class="mg-desc"><b>${esc(i.nome)}</b><em>${esc(i.nota)}</em><span>Conta contábil: <code>${esc(i.conta)}</code></span></div>
            ${campos}
            <div class="mg-res" data-res="${i.k}"></div>
          </div>`;
        }).join('')}
      </section>`).join('')}`;
    atualizarPremissas();
    $$('[data-p]').forEach(i => i.addEventListener('input', () => {
      atual.premissas[i.dataset.p] = { ...(atual.premissas[i.dataset.p] || {}), [i.dataset.c]: parse.num(i.value) };
      atualizarPremissas(); salvar();
    }));
    $('#restaurar')?.addEventListener('click', () => {
      if (!confirm(`Voltar as premissas e os planos de "${atual.nome}" para os valores padrão?`)) return;
      atual.premissas = premissasPadrao(); atual.planos = planosPadrao();
      render(); salvar(true);
    });
  }
  function atualizarPremissas() {
    PREMISSAS.flatMap(s => s.itens).forEach(i => {
      const el = $(`[data-res="${i.k}"]`);
      if (el) el.innerHTML = i.tipo === 'pct' ? `<span>Aplicado</span><b>${pct2(atual.premissas[i.k]?.pct)}</b>`
        : `<span>Custo unitário</span><b>${brl(unit(i.k))} <small>por ${esc(i.base)}</small></b>`;
    });
  }

  // ----- aba Comparar planos -----
  // linhas da tabela: in = campo editável do plano; calc = valor calculado
  const LINHAS = [
    { secao: 'Bases do plano' },
    { in: 'venda', label: 'Venda média do cliente (R$/mês)' },
    { in: 'pedidos', label: 'Pedidos médios por mês' },
    { calc: r => brl(r.ticket), label: 'Ticket médio por pedido', forte: true },
    { in: 'skus', label: 'SKUs base do plano' },
    { in: 'freezers', label: 'Freezers (fração do plano)', ajuda: '1/4 = 0,25 · 1/2 = 0,5 · inteiro = 1 · sem freezer = 0. Multiplica aluguel e energia do freezer.' },
    { in: 'microondas', label: 'Microondas (unid.)', ajuda: 'Com microondas, a energia do microondas é cobrada por pedido.' },
    { in: 'm2', label: 'Área ocupada (m²)', ajuda: 'Multiplica o custo de ocupação por m².' },
    { in: 'cnpjs', label: 'CNPJs', ajuda: 'Multiplica a licença de software (por CNPJ).' },
    { secao: 'Receita' },
    { in: 'mensalidade', label: 'Mensalidade fixa (R$)' },
    { in: 'aliq', label: 'Alíquota variável (% s/ venda)' },
    { in: 'vpp', label: 'Valor variável por pedido (R$)' },
    { calc: r => brl(r.recVar), label: '(=) Receita variável' },
    { calc: r => brl(r.bruta), label: '(=) Receita bruta', forte: true },
    { secao: 'Impostos' },
    { calc: r => neg(r.imposto), label: '(−) Imposto' },
    { calc: r => brl(r.liquida), label: '(=) Receita líquida', forte: true },
    { secao: 'Custos dos serviços prestados (CSP)' },
    { calc: r => neg(r.aluguel), label: '(−) Aluguel de equipamentos (freezer)' },
    { calc: r => neg(r.energia), label: '(−) Energia do freezer' },
    { calc: r => neg(r.micro), label: '(−) Energia do microondas' },
    { calc: r => neg(r.software), label: '(−) Software / Licença DS' },
    { calc: r => neg(r.csp), label: '(=) Total CSP' },
    { secao: 'Mão de obra operacional' },
    { calc: r => neg(r.mo), label: '(−) Mão de obra operacional' },
    { secao: 'Ocupação' },
    { calc: r => neg(r.ocup), label: '(−) Ocupação (m²)' },
    { calc: r => neg(r.ocup), label: '(=) Total ocupação' },
    { calc: r => brl(r.lucro), label: '(=) Lucro bruto', destaque: true },
    { calc: r => pct1(r.mb), label: '(%) Margem bruta', destaque: true },
    { secao: 'Comercial' },
    { calc: r => neg(r.comissao), label: '(−) Comissão' },
    { calc: r => brl(r.mc), label: '(=) Margem de contribuição', destaque: true },
    { calc: r => pct1(r.mcp), label: '(%) Margem de contribuição', destaque: true },
  ];

  function renderComparar() {
    const dis = canEdit ? '' : 'disabled';
    const ps = atual.planos;
    $('#mg-conteudo').innerHTML = `
      <p class="muted mg-dica">Todos os planos lado a lado, com a conta completa. Os campos em branco são editáveis.</p>
      <section class="card table-card"><div class="table-wrap"><table class="mg-tab">
        <thead><tr><th class="mg-rot">Plano</th>${ps.map(p => `<th>
          <input class="mg-nome" data-plano="${esc(p.id)}" data-f="nome" value="${esc(p.nome)}" ${dis} aria-label="Nome do plano">
          ${canEdit && ps.length > 1 ? `<button class="icon-btn small mg-rm" data-rm="${esc(p.id)}" title="Remover plano" aria-label="Remover plano ${esc(p.nome)}">×</button>` : ''}</th>`).join('')}</tr></thead>
        <tbody>${LINHAS.map((l, li) => {
          if (l.secao) return `<tr class="mg-secao"><th colspan="${ps.length + 1}">${esc(l.secao)}</th></tr>`;
          const cls = [l.destaque ? 'mg-dest' : '', l.forte ? 'mg-forte' : ''].join(' ');
          return `<tr class="${cls}"><td class="mg-rot" ${l.ajuda ? `title="${esc(l.ajuda)}"` : ''}>${esc(l.label)}${l.ajuda ? ' <span class="mg-ajuda">ⓘ</span>' : ''}</td>${ps.map(p => l.in
            ? `<td><input class="mg-in" data-plano="${esc(p.id)}" data-f="${l.in}" inputmode="decimal" value="${numIn(p[l.in])}" ${dis}></td>`
            : `<td class="mg-val" data-calc="${li}" data-plano="${esc(p.id)}"></td>`).join('')}</tr>`;
        }).join('')}</tbody>
      </table></div>
      ${canEdit ? '<button class="btn ghost small mg-add" id="add-plano">+ Adicionar plano</button>' : ''}</section>`;
    atualizarTabela();
    $$('[data-plano][data-f]').forEach(i => i.addEventListener('input', () => {
      const p = atual.planos.find(x => x.id === i.dataset.plano);
      p[i.dataset.f] = i.dataset.f === 'nome' ? i.value : parse.num(i.value);
      atualizarTabela(); salvar();
    }));
    $$('[data-rm]').forEach(b => b.addEventListener('click', () => {
      const p = atual.planos.find(x => x.id === b.dataset.rm);
      if (!confirm(`Remover o plano "${p.nome}"?`)) return;
      atual.planos = atual.planos.filter(x => x.id !== p.id);
      renderComparar(); salvar(true);
    }));
    $('#add-plano')?.addEventListener('click', () => {
      const ult = atual.planos[atual.planos.length - 1];
      atual.planos.push({ ...structuredClone(ult || planosPadrao()[0]), id: Store.uid(), nome: 'Novo plano' });
      renderComparar(); salvar(true);
      $$('.mg-nome').pop()?.select();
    });
  }
  function atualizarTabela() {
    atual.planos.forEach(p => {
      const r = calcular(p);
      $$(`[data-calc][data-plano="${CSS.escape(p.id)}"]`).forEach(td => { td.textContent = LINHAS[td.dataset.calc].calc(r); });
    });
  }

  // ---------- salvar / cenários ----------
  function salvar(imediato = false) {
    if (!canEdit) return;
    clearTimeout(timer);
    $('#estado').textContent = 'Salvando…';
    const go = async () => {
      try { await Store.save(TABELA, atual); $('#estado').textContent = 'Salvo'; }
      catch (e) { $('#estado').textContent = 'Erro ao salvar'; toast(e.message, 'error'); }
    };
    if (imediato) go(); else timer = setTimeout(go, 700);
  }

  $('#cenario').addEventListener('change', e => { atual = cenarios.find(c => c.id === e.target.value); render(); });
  $$('.mg-aba').forEach(b => b.addEventListener('click', () => {
    aba = b.dataset.aba;
    try { localStorage.setItem('gh_margem_aba', aba); } catch {}
    render();
  }));
  if (canEdit) {
    $('#novo-cenario').addEventListener('click', () => {
      const nome = prompt('Nome do novo cenário (ex.: DS · HUB2). Ele começa como cópia do cenário atual:', `${atual.nome} (cópia)`);
      if (!nome?.trim()) return;
      const c = { ...structuredClone(atual), id: 'c_' + Store.uid(), nome: nome.trim(), criado_em: new Date().toISOString() };
      c.planos.forEach(p => { p.id = Store.uid(); });
      cenarios.push(c); atual = c; render(); salvar(true);
    });
    $('#renomear').addEventListener('click', () => {
      const nome = prompt('Novo nome do cenário:', atual.nome);
      if (!nome?.trim()) return;
      atual.nome = nome.trim(); render(); salvar(true);
    });
    $('#excluir-cenario').addEventListener('click', async () => {
      if (cenarios.length === 1) return toast('É preciso manter pelo menos um cenário', 'error');
      if (!confirm(`Excluir o cenário "${atual.nome}"?`)) return;
      try { await Store.remove(TABELA, atual.id); } catch (e) { return toast(e.message, 'error'); }
      cenarios = cenarios.filter(c => c.id !== atual.id); atual = cenarios[0]; render();
    });
  } else $$('#novo-cenario, #renomear, #excluir-cenario').forEach(b => b.remove());

  (async () => {
    try { cenarios = (await Store.list(TABELA)).sort((a, b) => (a.criado_em || '').localeCompare(b.criado_em || '')); }
    catch (e) { toast('Erro ao carregar: ' + e.message, 'error'); }
    if (!cenarios.length) cenarios = [cenarioPadrao()];
    // cenários antigos sem algum campo novo recebem o padrão
    cenarios.forEach(c => { c.premissas = { ...premissasPadrao(), ...(c.premissas || {}) }; if (!c.planos?.length) c.planos = planosPadrao(); });
    atual = cenarios[0];
    render();
  })();
})();
