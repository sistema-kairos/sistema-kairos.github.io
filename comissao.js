// Comercial → Quanto vou ganhar: comissão conforme a Política de Remuneração Variável (minuta v1.0, out/2026).
// Regras ajustáveis em config/comissao (só administradores). Dados: negociações do CRM em "Negócio fechado" e a seção "Comissão" de cada uma
//   comissao: { mensalidade, origem, originador, coexecutor, taxa_paga_em, inicio_operacao }
// Por contrato: orçamento = mensalidade fixa × 12 × 5%, repartido entre
//   fechamento (% do nível do vendedor + acelerador a partir da 3ª venda do mês; 70/30 se compartilhada),
//   originação (Marketing 15% · prospecção ativa 10% · reaquecimento da base 5% · não comprovada 0),
//   liderança (júnior 15% · pleno 10%), direção (júnior 10% · pleno/sênior 5%) e fundo Kairós (10%). Teto: 100% do orçamento.
// Pagamento: metade quando a taxa de implementação é paga; metade quando o cliente completa 6 meses de operação.
// Upsell (comissao.tipo = 'Upsell', cláusula 10.3): quem fechou recebe 50% do aumento na mensalidade, de uma vez, depois do
//   1º pagamento da nova mensalidade (comissao.upsell_pago_em). Não conta como contrato novo (nível e acelerador).
(() => {
  if (window.SEM_ACESSO) return;

  const PADRAO = {
    orcamento_pct: 5, meses: 12,
    niveis: [
      { nome: 'Junior I', a_partir: 9, pct: 40, grupo: 'junior' },
      { nome: 'Junior II', a_partir: 16, pct: 45, grupo: 'junior' },
      { nome: 'Pleno I', a_partir: 24, pct: 50, grupo: 'pleno' },
      { nome: 'Pleno II', a_partir: 35, pct: 55, grupo: 'pleno' },
      { nome: 'Sênior I', a_partir: 50, pct: 60, grupo: 'senior' },
      { nome: 'Sênior II', a_partir: 75, pct: 60, grupo: 'senior' },
    ],
    acelerador_pp: 5, acelerador_a_partir: 3,
    marketing_pct: 15, prospeccao_pct: 10, reaquecimento_pct: 5, marketing_nome: 'Marketing',
    lider: 'Arthur Rocha', lider_aliases: 'arthurrocha, Arthur', lider_junior_pct: 15, lider_pleno_pct: 10,
    diretor: 'Ivon', diretor_aliases: 'Ivon Mascarenhas', diretor_junior_pct: 10, diretor_outros_pct: 5,
    fundo_pct: 10, coexecutor_pct: 30, upsell_pct: 50,
    pessoas: { 'Arthur Rocha': 'Sênior I' },   // nível definido pela gestão (prevalece sobre a contagem); o líder hoje é sênior
  };
  const FECHADO = 'Negócio fechado';
  const ehAdmin = Store.isAdmin();
  let cfg = structuredClone(PADRAO), deals = [], pessoa = null, mes = dates.today().slice(0, 7);

  // ---------- utilidades ----------
  const n = v => Number(v) || 0;
  const brl = v => fmt.money(Math.round(v * 100) / 100);
  const pctTxt = v => `${String(Math.round(v * 10) / 10).replace('.', ',')}%`;
  const lista = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  // a mesma pessoa aparece com nomes diferentes no CRM (ex.: "arthurrocha" e "Arthur Rocha")
  const canonico = nome => {
    const k = norm(nome);
    if (!k) return '';
    if ([cfg.lider, ...lista(cfg.lider_aliases)].some(x => norm(x) === k)) return cfg.lider;
    if ([cfg.diretor, ...lista(cfg.diretor_aliases)].some(x => norm(x) === k)) return cfg.diretor;
    return String(nome).trim();
  };
  const fechadoEm = d => (d.historico || []).filter(h => h.etapa === FECHADO).map(h => h.em).sort().pop() || d.etapa_desde || d.criado_em;
  const addMeses = (iso, k) => { const [y, m, dd] = iso.slice(0, 10).split('-').map(Number); return dates.toISO(new Date(y, m - 1 + k, dd)); };
  const mensalidade = d => n(d.comissao?.mensalidade) || n(d.valor_total);
  function origemDe(d) {
    if (d.comissao?.origem) return d.comissao.origem;
    const f = norm(d.fonte);
    if (/prospec/.test(f)) return 'Prospecção ativa';
    if (/formul|instagram|midias|tiktok|youtube|typeform|site|campanha|anuncio|evento/.test(f)) return 'Marketing';
    return 'Não comprovada';
  }

  // ---------- nível e acelerador ----------
  const ehUpsell = d => d.comissao?.tipo === 'Upsell';
  const fechados = () => deals.filter(d => d.etapa === FECHADO && !ehUpsell(d));   // contratos novos (nível e acelerador)
  const vendas = () => deals.filter(d => d.etapa === FECHADO);                      // contratos novos e upsells
  const contratosAte = (p, fimISO) => fechados().filter(d => canonico(d.responsavel) === p && fechadoEm(d).slice(0, 10) <= fimISO).length;
  function nivelDe(p, fimISO) {
    if (p === cfg.diretor) return { ...(cfg.niveis.find(x => x.grupo === 'senior') || cfg.niveis[cfg.niveis.length - 1]), definido: true };   // diretor recebe como sênior
    const fixo = cfg.pessoas?.[p] && cfg.niveis.find(x => x.nome === cfg.pessoas[p]);
    if (fixo) return { ...fixo, definido: true };
    const total = contratosAte(p, fimISO);
    const ord = [...cfg.niveis].sort((a, b) => a.a_partir - b.a_partir);
    return [...ord].reverse().find(x => total >= x.a_partir) || ord[0];   // abaixo do primeiro patamar: nível de entrada
  }
  const rankNoMes = d => {
    const p = canonico(d.responsavel), ym = dates.ym(fechadoEm(d));
    return fechados().filter(x => canonico(x.responsavel) === p && dates.ym(fechadoEm(x)) === ym)
      .sort((a, b) => fechadoEm(a).localeCompare(fechadoEm(b))).findIndex(x => x.id === d.id) + 1;
  };

  // ---------- repartição de um contrato ----------
  function repartir(d) {
    if (ehUpsell(d)) {
      const F = canonico(d.responsavel) || 'Sem responsável', aumento = mensalidade(d), pct = n(cfg.upsell_pct);
      return { d, upsell: true, B: aumento, F, origem: 'Upsell', partes: [{ quem: F, papel: `Upsell (${pctTxt(pct)} do aumento)`, pct, valor: aumento * pct / 100 }],
        total: pct, excede: false, fim: fechadoEm(d).slice(0, 10), p1: d.comissao?.upsell_pago_em || null, p2: null };
    }
    const B = mensalidade(d) * n(cfg.meses) * n(cfg.orcamento_pct) / 100;
    const F = canonico(d.responsavel) || 'Sem responsável';
    const fim = fechadoEm(d).slice(0, 10);
    const senior = cfg.niveis.find(x => x.grupo === 'senior') || cfg.niveis[cfg.niveis.length - 1];
    const nivel = F === cfg.diretor ? senior : nivelDe(F, fim);   // diretor que fecha recebe a participação sênior
    const origem = origemDe(d), originador = canonico(d.comissao?.originador) || F;
    const partes = [];
    const add = (quem, papel, pct) => { if (pct > 0) partes.push({ quem, papel, pct }); };

    const lider = F === cfg.lider ? 0 : nivel.grupo === 'junior' ? n(cfg.lider_junior_pct) : nivel.grupo === 'pleno' ? n(cfg.lider_pleno_pct) : 0;
    const dir = F === cfg.diretor ? 0 : nivel.grupo === 'junior' ? n(cfg.diretor_junior_pct) : n(cfg.diretor_outros_pct);
    const orig = origem === 'Marketing' ? n(cfg.marketing_pct) : origem === 'Prospecção ativa' ? n(cfg.prospeccao_pct) : origem === 'Reaquecimento da base' ? n(cfg.reaquecimento_pct) : 0;
    const fundo = n(cfg.fundo_pct);
    const fixo = n(nivel.pct) + lider + dir + orig + fundo;
    const rank = rankNoMes(d);
    const acelPedido = rank >= n(cfg.acelerador_a_partir) ? n(cfg.acelerador_pp) : 0;
    const acel = Math.max(0, Math.min(acelPedido, 100 - fixo));   // o acelerador usa só o saldo do orçamento

    const fech = n(nivel.pct) + acel, co = canonico(d.comissao?.coexecutor);
    if (co && co !== F) {
      add(F, `Fechamento (${nivel.nome}${acel ? ` + ${acel} p.p. acelerador` : ''}, 70%)`, fech * (100 - n(cfg.coexecutor_pct)) / 100);
      add(co, 'Venda compartilhada (30%)', fech * n(cfg.coexecutor_pct) / 100);
    } else add(F, `Fechamento (${nivel.nome}${acel ? ` + ${acel} p.p. acelerador` : ''})`, fech);
    if (origem === 'Marketing') add(cfg.marketing_nome, 'Originação Marketing', orig);
    else add(originador, `Originação: ${origem.toLowerCase()}`, orig);
    add(cfg.lider, 'Liderança comercial', lider);
    add(cfg.diretor, 'Direção comercial', dir);
    add('Fundo Kairós', 'Fundo coletivo (apurado no trimestre)', fundo);

    const total = partes.reduce((s, p) => s + p.pct, 0);
    partes.forEach(p => { p.valor = B * p.pct / 100; });
    // pagamento em duas metades
    const p1 = d.comissao?.taxa_paga_em || null;
    const p2 = addMeses(d.comissao?.inicio_operacao || fim, 6);
    return { d, B, F, nivel, origem, rank, acel, acelPedido, partes, total, excede: total > 100.001, fim, p1, p2 };
  }

  // ---------- tela ----------
  async function carregar() {
    try {
      const [ds, c] = await Promise.all([Store.list('crm'), Store.get('config', 'comissao').catch(() => null)]);
      deals = ds;
      if (c) cfg = { ...structuredClone(PADRAO), ...c, niveis: c.niveis?.length ? c.niveis : structuredClone(PADRAO.niveis) };
    } catch (e) { toast('Erro ao carregar: ' + e.message, 'error'); }
    montarPessoas();
    render();
  }
  const eu = () => canonico(Store.perfil().nome || (Store.getSession()?.email || '').split('@')[0] || 'Modo local');
  function pessoas() {
    const s = new Set();
    deals.forEach(d => { [d.responsavel, d.comissao?.coexecutor, d.comissao?.originador].forEach(x => { const c = canonico(x); if (c) s.add(c); }); });
    [cfg.lider, cfg.diretor, cfg.marketing_nome, 'Fundo Kairós'].forEach(x => s.add(x));
    return [...s].sort((a, b) => a.localeCompare(b));
  }
  function montarPessoas() {
    const sel = $('#pessoa');
    if (!ehAdmin) { pessoa = eu(); sel.replaceWith(Object.assign(document.createElement('b'), { textContent: pessoa, className: 'cm-eu' })); return; }
    const ps = pessoas();
    if (!pessoa) pessoa = ps.includes(eu()) ? eu() : ps[0];
    sel.innerHTML = ps.map(p => `<option ${p === pessoa ? 'selected' : ''}>${esc(p)}</option>`).join('');
  }

  function render() {
    $('#mes').value = mes;
    const todos = vendas().map(repartir);
    const minhas = todos.flatMap(r => r.partes.filter(p => p.quem === pessoa).map(p => ({ ...p, r })));
    const doMes = minhas.filter(x => dates.ym(x.r.fim) === mes);
    const gerado = doMes.reduce((s, x) => s + x.valor, 0);
    const parc = minhas.flatMap(x => x.r.upsell
      ? [{ x, n: 1, ym: x.r.p1 ? dates.ym(x.r.p1) : null, valor: x.valor }]
      : [{ x, n: 1, ym: x.r.p1 ? dates.ym(x.r.p1) : null, valor: x.valor / 2 },
         { x, n: 2, ym: dates.ym(x.r.p2), valor: x.valor / 2 }]);
    const receber = parc.filter(p => p.ym === mes);
    const aReceber = receber.reduce((s, p) => s + p.valor, 0);
    const aguardando = parc.filter(p => p.n === 1 && !p.ym).reduce((s, p) => s + p.valor, 0);

    // nível (só para quem fecha vendas)
    const vendedor = fechados().some(d => canonico(d.responsavel) === pessoa);
    const fimMes = dates.toISO(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0));
    const total = contratosAte(pessoa, fimMes), nivel = nivelDe(pessoa, fimMes);
    const ord = [...cfg.niveis].sort((a, b) => a.a_partir - b.a_partir);
    const prox = ord.find(x => x.a_partir > total && x.a_partir > nivel.a_partir);
    const noMes = fechados().filter(d => canonico(d.responsavel) === pessoa && dates.ym(fechadoEm(d)) === mes).length;

    Dash.kpis('#k-cm', [
      { label: `A receber em ${fmt.month(mes)}`, value: brl(aReceber), sub: `${receber.length} parcela${receber.length === 1 ? '' : 's'} com pagamento previsto no mês` },
      { label: `Gerado em ${fmt.month(mes)}`, value: brl(gerado), sub: `${doMes.length} participaç${doMes.length === 1 ? 'ão' : 'ões'} em contratos e upsells fechados no mês` },
      { label: 'Aguardando pagamento do cliente', value: brl(aguardando), sub: 'taxa de implementação ou 1º pagamento da nova mensalidade (upsell)' },
    ]);
    $('#nivel').innerHTML = !vendedor ? `<p class="muted">${esc(pessoa)} não tem vendas fechadas no CRM. As participações abaixo são de upsell, originação, liderança ou direção.</p>` : `
      <div class="cm-nivel">
        <div><span class="cm-rot">Nível</span><b>${esc(nivel.nome)}</b><small>${nivel.definido ? 'definido pela gestão' : `pela contagem de contratos`} · participação de ${pctTxt(nivel.pct)}</small></div>
        <div><span class="cm-rot">Contratos fechados</span><b>${total}</b><small>${prox ? `faltam ${prox.a_partir - total} para ${esc(prox.nome)}` : 'nível máximo'}</small></div>
        <div><span class="cm-rot">Vendas em ${fmt.month(mes)}</span><b>${noMes}</b><small>${noMes >= n(cfg.acelerador_a_partir) ? `acelerador de +${cfg.acelerador_pp} p.p. ativo a partir da ${cfg.acelerador_a_partir}ª venda` : `a partir da ${cfg.acelerador_a_partir}ª venda no mês: +${cfg.acelerador_pp} p.p.`}</small></div>
      </div>
      ${prox ? `<div class="cm-barra"><i style="width:${Math.min(100, (total - (nivel.a_partir > total ? 0 : nivel.a_partir)) / Math.max(1, prox.a_partir - (nivel.a_partir > total ? 0 : nivel.a_partir)) * 100)}%"></i></div>` : ''}`;

    $('#t-cm').innerHTML = minhas.sort((a, b) => b.r.fim.localeCompare(a.r.fim)).map(x => {
      const r = x.r, d = r.d;
      const p1 = r.upsell
        ? (r.p1 ? `${brl(x.valor)} <small>pagamento único em ${fmt.month(dates.ym(r.p1))}</small>` : `${brl(x.valor)} <small class="cm-pend">aguardando 1º pagamento</small>`)
        : r.p1 ? `${brl(x.valor / 2)} <small>em ${fmt.month(dates.ym(r.p1))}</small>` : `${brl(x.valor / 2)} <small class="cm-pend">aguardando taxa</small>`;
      const p2 = r.upsell ? '<span class="muted">—</span>' : `${brl(x.valor / 2)} <small>em ${fmt.month(dates.ym(r.p2))}</small>`;
      return `<tr class="${dates.ym(r.fim) === mes ? 'cm-mes' : ''}">
        <td><b>${esc(d.titulo || d.empresa?.nome || 'Negociação')}</b><small class="cm-sub">${esc(r.origem)}${r.excede ? ' · <span class="cm-pend">passa de 100% do orçamento</span>' : ''}</small></td>
        <td>${fmt.date(r.fim)}</td>
        <td class="num">${mensalidade(d) ? (r.upsell ? '+' : '') + brl(mensalidade(d)) + (r.upsell ? ' <small>aumento</small>' : '') : '<span class="cm-pend">sem valor</span>'}</td>
        <td class="num">${r.upsell ? '<span class="muted">—</span>' : brl(r.B)}</td>
        <td>${esc(x.papel)}</td>
        <td class="num">${pctTxt(x.pct)}</td>
        <td class="num"><b>${brl(x.valor)}</b></td>
        <td class="num">${p1}</td><td class="num">${p2}</td></tr>`;
    }).join('') || `<tr><td colspan="9" class="empty">Nenhuma comissão para ${esc(pessoa)} ainda.</td></tr>`;
  }

  // ---------- regras (administradores) ----------
  function editarRegras() {
    const c = structuredClone(cfg);
    const campo = (k, rot, suf = '%') => `<label class="field"><span>${rot}</span><div class="affix"><input class="input" data-k="${k}" type="number" step="any" value="${c[k] ?? ''}"><span>${suf}</span></div></label>`;
    const texto = (k, rot) => `<label class="field"><span>${rot}</span><input class="input" data-k="${k}" value="${esc(c[k] ?? '')}"></label>`;
    const dlg = openModal({
      title: 'Regras de comissão', wide: true,
      body: `<p class="small">Conforme a Política de Remuneração Variável (minuta v1.0). Mudanças valem para todos os cálculos da tela.</p>
        <h3>Níveis</h3>
        <div class="table-wrap"><table class="data static"><thead><tr><th>Nível</th><th>A partir de (contratos)</th><th>Participação</th><th>Grupo</th></tr></thead><tbody>
        ${c.niveis.map((x, i) => `<tr><td><input class="input" data-nv="${i}" data-c="nome" value="${esc(x.nome)}"></td>
          <td><input class="input" data-nv="${i}" data-c="a_partir" type="number" value="${x.a_partir}"></td>
          <td><div class="affix"><input class="input" data-nv="${i}" data-c="pct" type="number" step="any" value="${x.pct}"><span>%</span></div></td>
          <td><select class="input" data-nv="${i}" data-c="grupo">${['junior', 'pleno', 'senior'].map(g => `<option ${g === x.grupo ? 'selected' : ''}>${g}</option>`).join('')}</select></td></tr>`).join('')}
        </tbody></table></div>
        <h3>Orçamento, acelerador e origem</h3><div class="form-grid">
          ${campo('orcamento_pct', 'Orçamento (% da receita fixa de 12 meses)')}${campo('acelerador_pp', 'Acelerador', 'p.p.')}${campo('acelerador_a_partir', 'Acelerador a partir da venda nº', 'ª')}
          ${campo('marketing_pct', 'Origem Marketing')}${campo('prospeccao_pct', 'Origem prospecção ativa')}${campo('reaquecimento_pct', 'Origem reaquecimento da base')}
          ${campo('fundo_pct', 'Fundo Kairós')}${campo('coexecutor_pct', 'Coexecutor em venda compartilhada')}${campo('upsell_pct', 'Upsell (sobre o aumento na mensalidade)')}</div>
        <h3>Liderança e direção</h3><div class="form-grid">
          ${texto('lider', 'Liderança comercial')}${texto('lider_aliases', 'Outros nomes no CRM (separados por vírgula)')}
          ${campo('lider_junior_pct', 'Liderança sobre júnior')}${campo('lider_pleno_pct', 'Liderança sobre pleno')}
          ${texto('diretor', 'Direção comercial')}${texto('diretor_aliases', 'Outros nomes no CRM')}
          ${campo('diretor_junior_pct', 'Direção sobre júnior')}${campo('diretor_outros_pct', 'Direção sobre pleno e sênior')}
          ${texto('marketing_nome', 'Quem recebe a origem Marketing')}</div>
        <h3>Nível definido pela gestão</h3>
        <p class="small muted">Em branco, o nível sai da contagem de contratos fechados.</p>
        <div class="form-grid">${pessoas().filter(p => fechados().some(d => canonico(d.responsavel) === p)).map(p => `<label class="field"><span>${esc(p)}</span>
          <select class="input" data-pessoa="${esc(p)}"><option value="">Pela contagem</option>${c.niveis.map(x => `<option ${c.pessoas?.[p] === x.nome ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>`).join('')}</div>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Restaurar padrão', cls: 'ghost', onClick: async () => { await Store.save('config', { id: 'comissao', ...structuredClone(PADRAO) }); cfg = structuredClone(PADRAO); montarPessoas(); render(); toast('Regras padrão restauradas', 'ok'); } },
        { label: 'Salvar', cls: 'primary', onClick: async dlg => {
          $$('[data-k]', dlg).forEach(i => { c[i.dataset.k] = i.type === 'number' ? parse.num(i.value) : i.value.trim(); });
          $$('[data-nv]', dlg).forEach(i => { const x = c.niveis[i.dataset.nv]; x[i.dataset.c] = ['a_partir', 'pct'].includes(i.dataset.c) ? parse.num(i.value) : i.value; });
          c.pessoas = {};
          $$('[data-pessoa]', dlg).forEach(s => { if (s.value) c.pessoas[s.dataset.pessoa] = s.value; });
          await Store.save('config', { id: 'comissao', ...c });
          cfg = c; montarPessoas(); render();
          toast('Regras de comissão salvas', 'ok');
        } }],
    });
    return dlg;
  }

  // ---------- início ----------
  if (!ehAdmin && !Store.veArea('Comercial')) {
    $('main').innerHTML = '<div class="card no-access"><h2>Sem acesso</h2><p class="muted">Esta página é do Comercial.</p></div>';
    return;
  }
  $('#mes').addEventListener('change', e => { if (e.target.value) { mes = e.target.value; render(); } });
  $('#pessoa')?.addEventListener('change', e => { pessoa = e.target.value; render(); });
  if (ehAdmin) $('#regras').addEventListener('click', editarRegras); else $('#regras').remove();
  carregar();
})();
