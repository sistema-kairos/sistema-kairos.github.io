// CS → Faturamento dos clientes: leitura da planilha Faturamento Mensal (tabelas 'cs_faturamento' e 'cs_clientes').
(() => {
  if (window.SEM_ACESSO) return;
  const canEdit = Store.podeEditar('cs_clientes');
  let d = null, mes = '', visao = null;

  const pct = v => v === null ? '—' : fmt.num(v, 0) + '%';
  const varTxt = v => v === null ? '—' : (v > 0 ? '+' : '') + fmt.num(v, 0) + '%';
  const mesTxt = m => `Cobrança de ${fmt.month(m)}`;

  async function carregar() {
    try { d = await Fat.carregar(); }
    catch (e) { toast('Erro ao carregar: ' + e.message, 'error'); d = { meses: [], porMes: {}, espacos: {}, status: null }; }
    $('#importar').hidden = !canEdit || !Store.isRemote();
    const st = d.status;
    $('#status').textContent = st ? `Última importação ${fmt.ago(st.em)} (${st.abas} meses)` : 'Nenhuma importação ainda';
    $('#vazio').hidden = d.meses.length > 0;
    $('#conteudo').hidden = !d.meses.length;
    if (!d.meses.length) return;
    if (!mes || !d.meses.includes(mes)) mes = d.meses[d.meses.length - 1];
    $('#mes').innerHTML = d.meses.slice().reverse().map(m => `<option value="${m}">${mesTxt(m)}</option>`).join('');
    $('#mes').value = mes;
    const hubs = [...new Set(Object.values(d.porMes).flatMap(r => [...r.clientes.values()].map(c => c.hub)).filter(Boolean))].sort();
    const hubAtual = $('#hub').value;
    $('#hub').innerHTML = '<option value="">Todos os hubs</option>' + hubs.map(h => `<option>${esc(h)}</option>`).join('');
    $('#hub').value = hubs.includes(hubAtual) ? hubAtual : '';
    render();
  }

  function filtrados() {
    const hub = $('#hub').value, f = $('#filtro').value, q = norm($('#busca').value);
    return Fat.prioridade(visao.ativos.filter(c => (!hub || c.hub === hub) && (!q || c.key.includes(q))
      && (!f || (f === 'reuniao' ? c.reuniao : f === 'sem_espaco' ? !c.espaco : c.alertas.includes(f)))));
  }

  function render() {
    visao = Fat.clientes(d, mes);
    const hub = $('#hub').value;
    const ativos = visao.ativos.filter(c => !hub || c.hub === hub);
    const saiu = visao.saiu.filter(c => !hub || c.hub === hub);
    const total = ativos.reduce((s, c) => s + (c.fat || 0), 0);
    const totalAnt = visao.anterior ? [...d.porMes[visao.anterior].clientes.values()].filter(c => !hub || c.hub === hub).reduce((s, c) => s + (Number(c.faturamento) || 0), 0) : null;
    const comMeta = ativos.filter(c => c.pctMeta !== null);
    const conta = a => ativos.filter(c => c.alertas.includes(a)).length;
    $('#titulo-mes').textContent = `${mesTxt(mes)}${hub ? ' · ' + hub : ''}`;
    $('#info-mes').textContent = `aba "${d.porMes[mes].aba || ''}"${visao.anterior ? ` · comparado com ${fmt.month(visao.anterior)}` : ''}`;
    Dash.kpis('#k-resumo', [
      { label: 'Clientes ativos', value: String(ativos.length), sub: `${ativos.filter(c => c.novo).length} novos no mês` },
      { label: 'Saíram', value: String(saiu.length), cls: saiu.length ? 'alerta' : '', sub: visao.anterior ? `em relação a ${fmt.month(visao.anterior)}` : 'sem mês anterior' },
      { label: 'Faturamento dos clientes', value: fmt.moneyShort(total), sub: totalAnt ? `${varTxt((total / totalAnt - 1) * 100)} vs mês anterior` : '' },
      { label: 'Abaixo da meta', value: comMeta.length ? `${conta('abaixo')} de ${comMeta.length}` : '—', cls: conta('abaixo') ? 'alerta' : '',
        sub: comMeta.length < ativos.length ? `${ativos.length - comMeta.length} sem espaço com meta` : 'clientes com espaço definido' },
    ]);
    Dash.kpis('#k-alertas', [
      { label: 'Marcar reunião', value: String(ativos.filter(c => c.reuniao).length), sub: `queda de ${Math.abs(Fat.REGRAS.reuniaoQueda)}% ou mais, abaixo de ${Fat.REGRAS.reuniaoMeta}% da meta ou sem vendas` },
      { label: 'Queda forte', value: String(conta('queda')), sub: `${Fat.REGRAS.quedaForte}% ou mais vs mês anterior` },
      { label: 'Erro acima de 1%', value: String(conta('erro')), sub: 'refazer o treinamento' },
      { label: 'Sem vendas', value: String(conta('sem_vendas')), sub: 'faturamento zerado no mês' },
    ]);

    // gráfico: total por mês (filtrado pelo hub)
    const meses = d.meses.slice(-12);
    Dash.bar('c-total', { labels: meses.map(fmt.month), money: true, datasets: [{ label: 'Faturamento', data: meses.map(m =>
      [...d.porMes[m].clientes.values()].filter(c => !hub || c.hub === hub).reduce((s, c) => s + (Number(c.faturamento) || 0), 0)) }] });

    renderTabela();
    $('#s-saiu').hidden = !saiu.length;
    $('#saiu').innerHTML = saiu.map(c => `<li><b>${esc(c.cliente)}</b> <span class="muted">${esc([c.hub, c.modelos.join('/')].filter(Boolean).join(' · '))}${isBlank(c.faturamento) ? '' : ' · faturou ' + fmt.money(c.faturamento) + ' no mês anterior'}</span></li>`).join('');
  }

  function renderTabela() {
    const lista = filtrados();
    const opcoes = e => '<option value="">—</option>' + Fat.ESPACOS.map(x => `<option value="${x.id}" ${x.id === e ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
    $('#t-clientes').innerHTML = lista.length ? lista.map(c => {
      const barra = c.pctMeta === null ? '<span class="muted">—</span>'
        : `<span class="fat-meta ${c.pctMeta >= 100 ? 'ok' : c.pctMeta < Fat.REGRAS.reuniaoMeta ? 'down' : 'warn'}"><i style="width:${Math.min(100, c.pctMeta).toFixed(0)}%"></i></span><small>${pct(c.pctMeta)}</small>`;
      const situacao = [c.reuniao ? '<span class="badge down">Marcar reunião</span>' : '', c.novo ? '<span class="badge lilac">Novo</span>' : '',
        ...c.alertas.filter(a => a !== 'sem_vendas' || !c.reuniao).map(a => `<span class="badge ${Fat.ALERTAS[a].cls}">${Fat.ALERTAS[a].txt}</span>`)].filter(Boolean).join(' ');
      return `<tr data-k="${esc(c.key)}">
        <td class="fat-cli"><button type="button" class="link" data-ver="${esc(c.key)}">${esc(c.cliente)}</button><small class="muted">${esc(c.modelos.join('/'))}</small></td>
        <td>${esc(c.hub)}</td><td class="num">${c.dia ? String(c.dia).padStart(2, '0') : '—'}</td>
        <td><select class="input fat-esp" data-esp="${esc(c.key)}" ${canEdit ? '' : 'disabled'} aria-label="Espaço de ${esc(c.cliente)}">${opcoes(c.espaco)}</select></td>
        <td class="num">${fmt.money(c.fat)}</td><td class="num">${c.meta ? fmt.money(c.meta) : '—'}</td><td class="fat-pct">${barra}</td>
        <td class="num ${c.var !== null && c.var <= Fat.REGRAS.quedaForte ? 'neg' : ''}">${varTxt(c.var)}</td>
        <td class="num">${c.media3 === null ? '—' : fmt.money(c.media3)}</td>
        <td class="num">${c.cv === null ? '—' : pct(c.cv)}</td>
        <td class="num">${isBlank(c.pedidos) ? '—' : fmt.num(c.pedidos, 0)}</td><td class="num">${c.ticket === null ? '—' : fmt.money(c.ticket)}</td>
        <td class="num ${c.taxaErro !== null && c.taxaErro > Fat.REGRAS.erroMax ? 'neg' : ''}">${c.erros ? `${c.erros} (${fmt.num(c.taxaErro, 1)}%)` : '—'}</td>
        <td class="fat-sit">${situacao || '<span class="badge ok">Em dia</span>'}</td></tr>`;
    }).join('') : '<tr><td colspan="14" class="muted">Nenhum cliente com esse filtro.</td></tr>';
    $$('[data-esp]').forEach(s => s.addEventListener('change', () => salvarEspaco(s.dataset.esp, s.value)));
    $$('[data-ver]').forEach(b => b.addEventListener('click', () => detalhe(b.dataset.ver)));
  }

  async function salvarEspaco(k, espaco) {
    const c = visao.ativos.find(x => x.key === k);
    const rec = { ...(d.espacos[k] || {}), id: k, cliente: c?.cliente || k, espaco };
    d.espacos[k] = rec;
    render();
    try { d.espacos[k] = await Store.save('cs_clientes', rec); toast(`Espaço de ${rec.cliente} salvo`, 'ok'); }
    catch (e) { toast(e.message, 'error'); }
  }

  function detalhe(k) {
    const c = visao.ativos.find(x => x.key === k);
    if (!c) return;
    const linhas = d.meses.map(m => ({ m, x: d.porMes[m].clientes.get(k) })).filter(l => l.x);
    const body = `<p class="muted">${esc([c.hub, c.modelos.join('/'), c.espaco ? Fat.espacoTxt(c.espaco) : 'espaço não definido', c.dia ? 'fecha dia ' + String(c.dia).padStart(2, '0') : ''].filter(Boolean).join(' · '))}</p>
      <div class="chart-box"><canvas id="c-cli"></canvas></div>
      <div class="table-wrap"><table class="data static"><thead><tr><th>Mês</th><th class="num">Faturamento</th><th class="num">Pedidos</th><th class="num">Mensalidade</th><th class="num">Total Órion</th><th>OBS</th></tr></thead>
      <tbody>${linhas.slice().reverse().map(({ m, x }) => `<tr><td>${fmt.month(m)}</td><td class="num">${fmt.money(x.faturamento)}</td><td class="num">${isBlank(x.pedidos) ? '—' : fmt.num(x.pedidos, 0)}</td>
        <td class="num">${fmt.money(x.mensalidade_total ?? x.mensalidade)}</td><td class="num">${fmt.money(x.total_orion)}</td><td class="quebra small">${esc(x.obs || '')}</td></tr>`).join('')}</tbody></table></div>`;
    openModal({ title: c.cliente, body, wide: true, actions: [{ label: 'Fechar', cls: 'ghost' }] });
    Dash.bar('c-cli', { labels: linhas.map(l => fmt.month(l.m)), money: true, datasets: [{ label: 'Faturamento', data: linhas.map(l => Number(l.x.faturamento) || 0) }] });
  }

  async function importar() {
    $('#importar').disabled = true;
    try {
      const ok = await Store.rpc('importar_faturamento_agora');
      if (!ok) { toast('O endereço do Apps Script não está configurado (Sistema → Configurações → Avisos por e-mail).', 'error'); return; }
      toast('Importação pedida. A planilha chega em cerca de 1 minuto.', 'ok');
      const antes = d.status?.em;
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 10000));
        const st = (await Store.list('cs_faturamento_status').catch(() => [])).find(s => s.id === 'ultimo');
        if (st && st.em !== antes) { toast(`Planilha importada: ${st.abas} meses, ${st.linhas} linhas`, 'ok'); await carregar(); return; }
      }
      toast('A planilha ainda não chegou. Confira se o Apps Script foi atualizado e tente de novo em alguns minutos.', 'error');
    } catch (e) { toast(e.message, 'error'); }
    finally { $('#importar').disabled = false; }
  }

  const filtroUrl = new URLSearchParams(location.search).get('filtro');
  if (filtroUrl && [...$('#filtro').options].some(o => o.value === filtroUrl)) $('#filtro').value = filtroUrl;
  $('#mes').addEventListener('change', () => { mes = $('#mes').value; render(); });
  $('#hub').addEventListener('change', render);
  $('#filtro').addEventListener('change', renderTabela);
  $('#busca').addEventListener('input', renderTabela);
  $('#importar').addEventListener('click', importar);
  Dash.onThemeChange(() => d?.meses.length && render());
  carregar();
})();
