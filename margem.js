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
  function render() {
    $('#cenario').innerHTML = cenarios.map(c => `<option value="${esc(c.id)}" ${c.id === atual.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
    const dis = canEdit ? '' : 'disabled';
    $('#premissas').innerHTML = `
      <section class="card mg-intro">
        <div><h2>Premissas globais — <span>${esc(atual.nome)}</span></h2>
          <p>Toda premissa é <b>derivada</b>: você edita o custo total e a base de rateio, e o sistema calcula o custo unitário.
          Isso obriga a pensar nos números reais — não há atalho para martelar o unitário direto.</p></div>
        ${canEdit ? '<button class="btn ghost small" id="restaurar">Restaurar padrão</button>' : ''}
      </section>
      ${PREMISSAS.map(s => `<section class="card mg-sec">
        <h3 class="mg-sec-tit">${esc(s.secao)}</h3>
        ${s.itens.map(i => {
          const v = atual.premissas[i.k] || {};
          const campos = i.tipo === 'pct'
            ? `<label class="mg-campo mg-largo"><span>${esc(i.label)}</span><div class="affix"><input class="input" data-p="${i.k}" data-c="pct" inputmode="decimal" value="${numIn(v.pct)}" ${dis}><span>%</span></div></label>`
            : `<label class="mg-campo"><span>Custo total (R$)</span><div class="affix"><input class="input" data-p="${i.k}" data-c="total" inputmode="decimal" value="${numIn(v.total)}" ${dis}><span>R$</span></div></label>
               <label class="mg-campo"><span>Base (${esc(i.base)})</span><input class="input" data-p="${i.k}" data-c="base" inputmode="decimal" value="${numIn(v.base)}" ${dis}></label>`;
          return `<div class="mg-item">
            <div class="mg-desc"><b>${esc(i.nome)}</b><span>Conta: <code>${esc(i.conta)}</code></span><em>${esc(i.nota)}</em></div>
            ${campos}
            <div class="mg-res" data-res="${i.k}"></div>
          </div>`;
        }).join('')}
      </section>`).join('')}`;
    renderTabela();
    atualizarResultados();
    ligar();
  }

  function resultadoPremissa(i) {
    if (PREMISSAS[0].itens[0].k === i.k || i.tipo === 'pct') return `<span>Fração aplicada</span><b>${pct2(atual.premissas[i.k]?.pct)}</b>`;
    return `<span>Custo unitário</span><b>${brl(unit(i.k))} / ${esc(i.base)}</b>`;
  }

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

  function renderTabela() {
    const dis = canEdit ? '' : 'disabled';
    const ps = atual.planos;
    $('#planos').innerHTML = `
      <div class="table-wrap"><table class="mg-tab">
        <thead><tr><th class="mg-rot">Plano</th>${ps.map(p => `<th>
          <input class="mg-nome" data-plano="${esc(p.id)}" data-f="nome" value="${esc(p.nome)}" ${dis} aria-label="Nome do plano">
          ${canEdit && ps.length > 1 ? `<button class="icon-btn small mg-rm" data-rm="${esc(p.id)}" title="Remover plano" aria-label="Remover plano ${esc(p.nome)}">×</button>` : ''}</th>`).join('')}</tr></thead>
        <tbody>${LINHAS.map(l => {
          if (l.secao) return `<tr class="mg-secao"><th colspan="${ps.length + 1}">${esc(l.secao)}</th></tr>`;
          const cls = [l.destaque ? 'mg-dest' : '', l.forte ? 'mg-forte' : ''].join(' ');
          return `<tr class="${cls}"><td class="mg-rot" ${l.ajuda ? `title="${esc(l.ajuda)}"` : ''}>${esc(l.label)}${l.ajuda ? ' <span class="mg-ajuda">ⓘ</span>' : ''}</td>${ps.map(p => l.in
            ? `<td><input class="mg-in" data-plano="${esc(p.id)}" data-f="${l.in}" inputmode="decimal" value="${numIn(p[l.in])}" ${dis}></td>`
            : `<td class="mg-val" data-calc="${LINHAS.indexOf(l)}" data-plano="${esc(p.id)}"></td>`).join('')}</tr>`;
        }).join('')}</tbody>
      </table></div>
      ${canEdit ? '<button class="btn ghost small mg-add" id="add-plano">+ Adicionar plano</button>' : ''}`;
  }

  function atualizarResultados() {
    PREMISSAS.flatMap(s => s.itens).forEach(i => { const el = $(`[data-res="${i.k}"]`); if (el) el.innerHTML = resultadoPremissa(i); });
    atual.planos.forEach(p => {
      const r = calcular(p);
      $$(`[data-calc][data-plano="${CSS.escape(p.id)}"]`).forEach(td => { td.textContent = LINHAS[td.dataset.calc].calc(r); });
    });
  }

  function ligar() {
    $$('[data-p]').forEach(i => i.addEventListener('input', () => {
      atual.premissas[i.dataset.p] = { ...(atual.premissas[i.dataset.p] || {}), [i.dataset.c]: parse.num(i.value) };
      atualizarResultados(); salvar();
    }));
    ligarTabela();
    $('#restaurar')?.addEventListener('click', () => {
      if (!confirm(`Voltar as premissas e os planos de "${atual.nome}" para os valores padrão?`)) return;
      atual.premissas = premissasPadrao(); atual.planos = planosPadrao();
      render(); salvar(true);
    });
  }
  function ligarTabela() {
    $$('[data-plano][data-f]').forEach(i => i.addEventListener('input', () => {
      const p = atual.planos.find(x => x.id === i.dataset.plano);
      p[i.dataset.f] = i.dataset.f === 'nome' ? i.value : parse.num(i.value);
      atualizarResultados(); salvar();
    }));
    $$('[data-rm]').forEach(b => b.addEventListener('click', () => {
      const p = atual.planos.find(x => x.id === b.dataset.rm);
      if (!confirm(`Remover o plano "${p.nome}"?`)) return;
      atual.planos = atual.planos.filter(x => x.id !== p.id);
      renderTabela(); atualizarResultados(); ligarTabela(); salvar(true);
    }));
    $('#add-plano')?.addEventListener('click', () => {
      const ult = atual.planos[atual.planos.length - 1];
      atual.planos.push({ ...structuredClone(ult || planosPadrao()[0]), id: Store.uid(), nome: 'Novo plano' });
      renderTabela(); atualizarResultados(); ligarTabela(); salvar(true);
      $$('.mg-nome').pop()?.select();
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
