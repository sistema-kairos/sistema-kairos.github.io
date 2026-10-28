// CS → Rotina do dia: checklist dos blocos (tabela 'cs_rotina', um registro por pessoa e dia).
(() => {
  if (window.SEM_ACESSO) return;
  const canEdit = Store.podeEditar('cs_rotina');
  let dia = dates.today(), regs = {}, salvando = null;

  const idDe = iso => `${Estagio.email()}|${iso}`;
  const reg = iso => regs[iso] || { id: idDe(iso), usuario: Estagio.email(), nome: Estagio.nome(), data: iso, feitos: {}, obs: '' };
  const agora = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  async function carregar() {
    try {
      const todos = await Store.list('cs_rotina');
      regs = Object.fromEntries(todos.filter(r => r.usuario === Estagio.email()).map(r => [r.data, r]));
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
    const diasCheck = semana.filter(x => reg(x.d).feitos?.abastecimento).length;
    Dash.kpis('#k-rotina', [
      { label: 'Blocos concluídos hoje', value: blocos.length ? `${feitos} de ${blocos.length}` : '—', cls: blocos.length && feitos < blocos.length && dia < dates.today() ? 'alerta' : '', sub: blocos.length ? '' : 'sem rotina no fim de semana' },
      { label: 'Semana', value: `${semana.reduce((s, x) => s + x.ok, 0)} de ${semana.reduce((s, x) => s + x.total, 0)}`, sub: `blocos de ${Estagio.semanaTxt(seg)}` },
      { label: 'Checagem de abastecimento', value: `${diasCheck} de 5`, sub: 'dias na semana (indicador A)' },
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
