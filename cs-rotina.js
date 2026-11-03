// CS → Rotina do dia: checklist dos blocos e dos clientes do dia (tabela 'cs_rotina', um registro por pessoa e dia).
(() => {
  if (window.SEM_ACESSO) return;
  const canEdit = Store.podeEditar('cs_rotina');
  let dia = dates.today(), regs = {}, salvando = null, fat = null, verTodos = false;

  const idDe = iso => `${Estagio.email()}|${iso}`;
  const reg = iso => regs[iso] || { id: idDe(iso), usuario: Estagio.email(), nome: Estagio.nome(), data: iso, feitos: {}, contatos: {}, obs: '' };
  const agora = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  async function carregar() {
    try {
      const [todos, f] = await Promise.all([Store.list('cs_rotina'), Fat.carregar().catch(() => null)]);
      regs = Object.fromEntries(todos.filter(r => r.usuario === Estagio.email()).map(r => [r.data, r]));
      fat = f;
    } catch (e) { toast('Erro ao carregar: ' + e.message, 'error'); }
    render();
  }

  function render() {
    $('#dia').value = dia;
    $('#quem').textContent = Estagio.nome();
    const blocos = Estagio.rotina(dia), r = reg(dia);
    const feitos = blocos.filter(b => r.feitos?.[b.id]).length;
    const seg = Estagio.segundaDe(dia);
    const semana = Estagio.diasUteis(seg).map(d => ({ d, total: Estagio.rotina(d).length, ok: Estagio.rotina(d).filter(b => reg(d).feitos?.[b.id]).length }));
    const conversas = Estagio.contatosDe(r);
    const conversasSemana = Estagio.diasUteis(seg).reduce((s, d) => s + Estagio.contatosDe(reg(d)), 0);
    Dash.kpis('#k-rotina', [
      { label: 'Blocos concluídos hoje', value: blocos.length ? `${feitos} de ${blocos.length}` : '—', cls: blocos.length && feitos < blocos.length && dia < dates.today() ? 'alerta' : '', sub: blocos.length ? '' : 'sem rotina no fim de semana' },
      { label: 'Conversas com clientes', value: blocos.length ? `${conversas} de ${Estagio.CONVERSAS_DIA}` : '—', cls: blocos.length && conversas < Estagio.CONVERSAS_DIA && dia < dates.today() ? 'alerta' : '', sub: `${conversasSemana} na semana (indicador D)` },
      { label: 'Semana', value: `${semana.reduce((s, x) => s + x.ok, 0)} de ${semana.reduce((s, x) => s + x.total, 0)}`, sub: `blocos de ${Estagio.semanaTxt(seg)}` },
    ]);
    $('#semana').innerHTML = semana.map((x, i) => `<button class="et-dia ${x.d === dia ? 'atual' : ''} ${x.ok === x.total ? 'feito' : ''}" data-ir="${x.d}">
      <b>${Estagio.DIAS[i + 1]}</b><small>${fmt.date(x.d).slice(0, 5)} · ${x.ok}/${x.total}</small></button>`).join('');
    $$('[data-ir]').forEach(b => b.addEventListener('click', () => { dia = b.dataset.ir; render(); }));

    const dow = dates.toDate(dia).getDay();
    $('#titulo-dia').textContent = blocos.length ? `${Estagio.DIAS[dow]}, ${fmt.date(dia)}` : `${fmt.date(dia)}: fim de semana`;
    const hj = dia === dates.today(), h = agora();
    $('#blocos').innerHTML = blocos.length ? blocos.map(b => {
      const ok = !!r.feitos?.[b.id], vigente = hj && h >= b.ini && h < b.fim;
      return `<label class="card et-bloco ${ok ? 'feito' : ''} ${vigente ? 'vigente' : ''}">
        <input type="checkbox" data-bloco="${b.id}" ${ok ? 'checked' : ''} ${canEdit ? '' : 'disabled'}>
        <span class="et-hora">${b.ini}<small>${b.fim}</small></span>
        <span class="et-txt"><span class="et-tit"><b>${esc(b.titulo)}</b>${vigente ? '<span class="badge lime">agora</span>' : ''}</span><span>${esc(b.desc)}</span>
          ${b.link ? `<a class="small" href="${esc(b.link.href)}">${esc(b.link.txt)} ›</a>` : ''}
          ${b.ind ? `<small class="muted">Indicadores: ${esc(b.ind)}</small>` : ''}</span>
      </label>`;
    }).join('') : '<p class="muted">Sem rotina neste dia.</p>';
    $('#regras').innerHTML = blocos.length ? Estagio.REGRAS.map(t => `<li>${esc(t)}</li>`).join('') : '';
    $('#obs').value = r.obs || '';
    $('#obs').disabled = !canEdit || !blocos.length;
    $('.et-obs').hidden = !blocos.length;
    $$('[data-bloco]').forEach(c => c.addEventListener('change', () => {
      const novo = reg(dia);
      novo.feitos = { ...novo.feitos, [c.dataset.bloco]: c.checked };
      if (!c.checked) delete novo.feitos[c.dataset.bloco];
      salvar(novo);
    }));
    renderClientes(blocos.length > 0);
  }

  // clientes do dia: os de menor volume que ainda não tiveram conversa nesta semana
  function renderClientes(diaUtil) {
    $('#s-clientes').hidden = !diaUtil;
    if (!diaUtil) return;
    if (!fat?.meses?.length) {
      $('#clientes').innerHTML = '<p class="muted">A lista aparece quando a planilha de faturamento for importada em <a href="cs-faturamento.html">Faturamento dos clientes</a>.</p>';
      return;
    }
    const mes = fat.meses.filter(m => m <= dia.slice(0, 7)).pop() || fat.meses[fat.meses.length - 1];
    const lista = Fat.prioridade(Fat.clientes(fat, mes).ativos);
    const r = reg(dia), hoje = r.contatos || {};
    const seg = Estagio.segundaDe(dia);
    const semana = new Set(Estagio.diasUteis(seg).filter(d => d !== dia).flatMap(d => Object.keys(reg(d).contatos || {})));
    const pendentes = lista.filter(c => !semana.has(c.key) && !hoje[c.key]);
    const feitosHoje = lista.filter(c => hoje[c.key]);
    const faltam = Math.max(0, Estagio.CONVERSAS_DIA - feitosHoje.length);
    const mostrar = [...feitosHoje, ...(verTodos ? pendentes : pendentes.slice(0, faltam))];
    const item = (c, i) => {
      const ok = !!hoje[c.key], prio = !ok && i < Estagio.CONVERSAS_DIA;
      const info = [c.fat === null ? 'sem dado de vendas' : fmt.money(c.fat), c.pctMeta !== null ? `${fmt.num(c.pctMeta, 0)}% da meta` : '', c.var !== null ? `${c.var > 0 ? '+' : ''}${fmt.num(c.var, 0)}% vs mês anterior` : ''].filter(Boolean).join(' · ');
      return `<li><label class="et-cli ${ok ? 'feito' : prio ? 'prio' : ''}"><input type="checkbox" data-cli="${esc(c.key)}" ${ok ? 'checked' : ''} ${canEdit ? '' : 'disabled'}>
        <span><b>${esc(c.cliente)}</b><small>${esc([c.hub, info].filter(Boolean).join(' · '))}</small>${c.reuniao ? ' <span class="badge down">Marcar reunião</span>' : ''}</span></label></li>`;
    };
    $('#clientes').innerHTML = `<p class="muted small">${feitosHoje.length} de ${Estagio.CONVERSAS_DIA} conversas hoje · ${semana.size + feitosHoje.length} de ${lista.length} clientes já conversados nesta semana · ordem: menor volume primeiro (${fmt.month(mes)})</p>
      <ul class="et-cli-lista">${mostrar.map(item).join('') || '<li class="muted">Todos os clientes já tiveram conversa nesta semana.</li>'}</ul>
      ${pendentes.length > faltam ? `<button type="button" class="btn small ghost" id="ver-todos">${verTodos ? 'Mostrar só os do dia' : `Ver todos os ${pendentes.length} que faltam na semana`}</button>` : ''}`;
    $('#ver-todos')?.addEventListener('click', () => { verTodos = !verTodos; renderClientes(true); });
    $$('[data-cli]').forEach(c => c.addEventListener('change', () => {
      const novo = reg(dia), cli = lista.find(x => x.key === c.dataset.cli);
      novo.contatos = { ...(novo.contatos || {}) };
      if (c.checked) novo.contatos[c.dataset.cli] = { cliente: cli?.cliente || c.dataset.cli, hora: agora() };
      else delete novo.contatos[c.dataset.cli];
      salvar(novo);
    }));
  }

  async function salvar(r) {
    regs[r.data] = r;
    render();
    try { regs[r.data] = await Store.save('cs_rotina', r); }
    catch (e) { toast(e.message, 'error'); }
  }

  $('#obs').addEventListener('input', () => {
    clearTimeout(salvando);
    const texto = $('#obs').value;
    salvando = setTimeout(() => { const r = reg(dia); r.obs = texto; regs[dia] = r; Store.save('cs_rotina', r).catch(e => toast(e.message, 'error')); }, 800);
  });
  $('#dia').addEventListener('change', () => { if ($('#dia').value) { dia = $('#dia').value; render(); } });
  $('#ant').addEventListener('click', () => { dia = dates.addDays(dia, -1); render(); });
  $('#prox').addEventListener('click', () => { dia = dates.addDays(dia, 1); render(); });
  $('#hoje').addEventListener('click', () => { dia = dates.today(); render(); });
  carregar();
})();
