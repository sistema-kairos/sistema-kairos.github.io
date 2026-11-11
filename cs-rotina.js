// CS → Rotina do dia: checklist dos blocos e dos clientes do dia (tabela 'cs_rotina', um registro por pessoa e dia).
(() => {
  if (window.SEM_ACESSO) return;
  const canEdit = Store.podeEditar('cs_rotina');
  let dia = dates.today(), regs = {}, salvando = null, fat = null, verTodos = false, modeloRec = null;

  const idDe = iso => `${Estagio.email()}|${iso}`;
  const reg = iso => regs[iso] || { id: idDe(iso), usuario: Estagio.email(), nome: Estagio.nome(), data: iso, feitos: {}, contatos: {}, obs: '' };
  const agora = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  async function carregar() {
    try {
      const [todos, f] = await Promise.all([Store.list('cs_rotina'), Fat.carregar().catch(() => null)]);
      modeloRec = todos.find(r => r.id === 'modelo') || null;
      Estagio.usarModelo(modeloRec);
      regs = Object.fromEntries(todos.filter(r => r.usuario && r.usuario === Estagio.email()).map(r => [r.data, r]));
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
  // ---------- editar a rotina (vale para todo o CS a partir de hoje) ----------
  const btEditar = $('#editar-rotina');
  if (canEdit) btEditar.classList.remove('hidden');
  btEditar.addEventListener('click', editarRotina);

  function editarRotina() {
    let m = Estagio.modeloAtual(), diaSel = Math.min(5, Math.max(1, dates.toDate(dia).getDay() || 1));
    const NOMES = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
    const blocosDe = d => (m.dias[d] = m.dias[d] || m.dias[String(d)] || []);
    const dlg = openModal({
      title: 'Editar rotina do CS',
      wide: true,
      body: `<p class="muted small">A rotina nova vale para todo o CS <b>a partir de hoje</b>. Os dias anteriores continuam com a rotina da época, para não mudar os indicadores que já passaram.</p>
        <div class="form-grid"><label class="field"><span>Conversas com clientes por dia</span><input class="input" type="number" min="1" max="60" id="rt-conv"></label></div>
        <div class="rt-dias" role="tablist">${[1, 2, 3, 4, 5].map(d => `<button type="button" class="chip" data-rt-dia="${d}">${NOMES[d]}</button>`).join('')}</div>
        <div class="rt-blocos" id="rt-blocos"></div>
        <div class="rt-acoes"><button type="button" class="btn small" id="rt-add">+ Adicionar bloco</button>
          <label class="muted small">Copiar este dia para <select class="input rt-copia" id="rt-copia"><option value="">escolha…</option>${[1, 2, 3, 4, 5].map(d => `<option value="${d}">${NOMES[d]}</option>`).join('')}<option value="todos">todos os dias</option></select></label></div>
        <label class="field wide" style="margin-top:16px"><span>Regras que aparecem embaixo dos blocos (uma por linha)</span><textarea class="input" id="rt-regras" rows="4"></textarea></label>`,
      actions: [
        { label: 'Voltar ao padrão', cls: 'ghost left', onClick: () => {
          if (!confirm('Trocar o que está na tela pela rotina padrão? Nada é salvo até você clicar em "Salvar rotina".')) return false;
          m = Estagio.modeloPadrao(); preencher(); return false;
        } },
        { label: 'Cancelar', cls: 'ghost' },
        { label: 'Salvar rotina', cls: 'primary', onClick: salvarModelo },
      ],
    });
    const lista = $('#rt-blocos', dlg);
    function preencher() {
      $('#rt-conv', dlg).value = m.conversas_dia || Estagio.CONVERSAS_DIA;
      $('#rt-regras', dlg).value = (m.regras || []).join('\n');
      desenhar();
    }
    function desenhar() {
      $$('[data-rt-dia]', dlg).forEach(b => b.classList.toggle('on', +b.dataset.rtDia === diaSel));
      const bs = blocosDe(diaSel);
      lista.innerHTML = bs.length ? bs.map((b, i) => `<div class="card rt-bloco" data-i="${i}">
          <div class="rt-linha">
            <label class="field"><span>Início</span><input class="input" type="time" data-k="ini" value="${esc(b.ini || '')}"></label>
            <label class="field"><span>Fim</span><input class="input" type="time" data-k="fim" value="${esc(b.fim || '')}"></label>
            <label class="field rt-tit"><span>Título</span><input class="input" data-k="titulo" value="${esc(b.titulo || '')}" placeholder="Ex.: ChatPro: pendências"></label>
            <div class="rt-mover">
              <button type="button" class="icon-btn small" data-mv="-1" title="Subir" ${i ? '' : 'disabled'}>↑</button>
              <button type="button" class="icon-btn small" data-mv="1" title="Descer" ${i < bs.length - 1 ? '' : 'disabled'}>↓</button>
              <button type="button" class="icon-btn small danger" data-rm title="Remover bloco">×</button>
            </div>
          </div>
          <label class="field"><span>O que fazer</span><textarea class="input" rows="2" data-k="desc">${esc(b.desc || '')}</textarea></label>
          <div class="rt-linha">
            <label class="field"><span>Indicadores</span><input class="input" data-k="ind" value="${esc(b.ind || '')}" placeholder="Ex.: A, B"></label>
            <label class="field"><span>Link (opcional)</span><input class="input" data-k="link.href" value="${esc(b.link?.href || '')}" placeholder="cs-faturamento.html"></label>
            <label class="field"><span>Texto do link</span><input class="input" data-k="link.txt" value="${esc(b.link?.txt || '')}" placeholder="Abrir Faturamento"></label>
          </div>
          <label class="check"><input type="checkbox" data-k="fat" ${b.fat ? 'checked' : ''}> Nos dias de faturamento, este bloco vira a análise da planilha</label>
        </div>`).join('') : '<p class="muted">Nenhum bloco neste dia. Clique em "+ Adicionar bloco".</p>';
      $$('.rt-bloco', lista).forEach(el => {
        const b = bs[+el.dataset.i];
        $$('[data-k]', el).forEach(inp => inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
          const k = inp.dataset.k;
          if (k === 'fat') b.fat = inp.checked || undefined;
          else if (k.startsWith('link.')) { b.link = { ...(b.link || {}), [k.slice(5)]: inp.value.trim() }; }
          else b[k] = inp.value;
        }));
        $$('[data-mv]', el).forEach(bt => bt.addEventListener('click', () => {
          const i = +el.dataset.i, j = i + +bt.dataset.mv;
          [bs[i], bs[j]] = [bs[j], bs[i]]; desenhar();
        }));
        $('[data-rm]', el).addEventListener('click', () => {
          if (!confirm(`Remover o bloco "${b.titulo || 'sem título'}" de ${NOMES[diaSel]}?`)) return;
          bs.splice(+el.dataset.i, 1); desenhar();
        });
      });
    }
    $$('[data-rt-dia]', dlg).forEach(b => b.addEventListener('click', () => { diaSel = +b.dataset.rtDia; desenhar(); }));
    $('#rt-add', dlg).addEventListener('click', () => {
      const bs = blocosDe(diaSel), ult = bs[bs.length - 1];
      bs.push({ id: Store.uid().slice(0, 8), ini: ult?.fim || '13:00', fim: '', titulo: '', desc: '', ind: '' });
      desenhar();
      $$('.rt-bloco', lista).pop()?.querySelector('[data-k="titulo"]')?.focus();
    });
    $('#rt-copia', dlg).addEventListener('change', e => {
      const alvo = e.target.value; e.target.value = '';
      if (!alvo) return;
      const dias = alvo === 'todos' ? [1, 2, 3, 4, 5].filter(d => d !== diaSel) : [+alvo].filter(d => d !== diaSel);
      if (!dias.length || !confirm(`Substituir os blocos de ${dias.map(d => NOMES[d]).join(', ')} pelos de ${NOMES[diaSel]}?`)) return;
      dias.forEach(d => { m.dias[d] = JSON.parse(JSON.stringify(blocosDe(diaSel))); });
      toast('Blocos copiados', 'ok');
    });
    preencher();

    async function salvarModelo() {
      const conv = Math.round(+$('#rt-conv', dlg).value);
      if (!(conv > 0)) { toast('Informe quantas conversas por dia'); return false; }
      for (const d of [1, 2, 3, 4, 5]) {
        const bs = blocosDe(d);
        for (const b of bs) {
          b.titulo = String(b.titulo || '').trim(); b.desc = String(b.desc || '').trim(); b.ind = String(b.ind || '').trim();
          if (b.link && !b.link.href) delete b.link; else if (b.link && !b.link.txt) b.link.txt = 'Abrir';
          if (!b.titulo || !b.ini || !b.fim) { diaSel = d; desenhar(); toast(`${NOMES[d]}: todo bloco precisa de início, fim e título`); return false; }
          if (b.fim <= b.ini) { diaSel = d; desenhar(); toast(`${NOMES[d]}: "${b.titulo}" termina antes de começar`); return false; }
        }
        bs.sort((a, b) => a.ini.localeCompare(b.ini));
        const ids = new Set();
        bs.forEach(b => { if (!b.id || ids.has(b.id)) b.id = Store.uid().slice(0, 8); ids.add(b.id); });
      }
      const hoje = dates.today();
      const versao = { desde: hoje, dias: m.dias, regras: $('#rt-regras', dlg).value.split('\n').map(x => x.trim()).filter(Boolean), conversas_dia: conv, por: Estagio.nome(), em: new Date().toISOString() };
      const versoesAntigas = (modeloRec?.versoes || []).filter(v => v.desde !== hoje);
      const rec = { ...(modeloRec || {}), id: 'modelo', modelo: true, versoes: [...versoesAntigas, versao].sort((a, b) => a.desde.localeCompare(b.desde)).slice(-30) };
      try { modeloRec = await Store.save('cs_rotina', rec); }
      catch (e) { toast('Não foi possível salvar: ' + e.message, 'error'); return false; }
      Estagio.usarModelo(modeloRec);
      render();
      toast('Rotina salva. Vale a partir de hoje para todo o CS.', 'ok');
    }
  }

  $('#dia').addEventListener('change', () => { if ($('#dia').value) { dia = $('#dia').value; render(); } });
  $('#ant').addEventListener('click', () => { dia = dates.addDays(dia, -1); render(); });
  $('#prox').addEventListener('click', () => { dia = dates.addDays(dia, 1); render(); });
  $('#hoje').addEventListener('click', () => { dia = dates.today(); render(); });
  carregar();
})();
