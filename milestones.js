// Milestones dos clientes (CS → Milestones).
//   'milestones'        id = id do cliente (aba Clientes) → datas lançadas pelo CS { pedidos_1000, faturado_1mm, novo_hub, super }
//   'milestone_avisos'  id = '<cliente>|<marco>' → conquistas registradas pelo banco (privado.verificar_milestones, todo dia às 8h
//                       e na hora em que uma data é lançada). Aqui o CS só marca a conquista como celebrada.
(() => {
  if (window.SEM_ACESSO) return;

  const canEdit = Store.podeEditar('milestones');
  const MANUAIS = { pedidos_1000: 'Primeiros 1.000 pedidos', faturado_1mm: 'R$ 1 milhão faturado', novo_hub: 'Abertura em um novo hub', super: 'Atingiu a marca Super' };
  let clientes = [], cs = [], datas = {}, avisos = [];
  let editando = null;   // 'idCliente|marco' em edição

  const entradaDe = c => c.data_entrada_real || c.data_entrada_contrato || null;
  const hoje = () => dates.today();
  const saiu = c => cs.some(r => norm(r.loja) === norm(c.nome_loja) && r.data_saida_prevista && r.data_saida_prevista <= hoje());
  const avisoDe = (id, marco) => avisos.find(a => a.id === `${id}|${marco}`);
  // aniversário: anos completos e a próxima data
  function anos(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number), t = hoje();
    let n = Number(t.slice(0, 4)) - y;
    if (t.slice(5) < iso.slice(5)) n--;
    const prox = `${y + n + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { n: Math.max(0, n), prox };
  }

  async function carregar() {
    try {
      [clientes, cs, avisos] = await Promise.all([Store.list('comercial'), Store.list('cs').catch(() => []), Store.list('milestone_avisos')]);
      datas = Object.fromEntries((await Store.list('milestones')).map(r => [r.id, r]));
    } catch (e) { toast('Erro ao carregar: ' + e.message, 'error'); }
    const hubs = [...new Set(clientes.map(c => c.hub).filter(Boolean))].sort();
    $('#f-hub').innerHTML = '<option value="">Todos os hubs</option>' + hubs.map(h => `<option>${esc(h)}</option>`).join('');
    render();
  }

  function render() {
    renderCelebrar();
    renderTabela();
  }

  // ---------- conquistas para celebrar ----------
  function renderCelebrar() {
    const ativos = avisos.filter(a => !a.historico);
    const pendentes = ativos.filter(a => !a.celebrado_em).sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const mes = ativos.filter(a => a.data >= dates.addDays(hoje(), -30));
    const em30 = clientes.filter(c => !saiu(c) && entradaDe(c)).map(c => ({ c, a: anos(entradaDe(c)) }))
      .filter(x => x.a && x.a.prox <= dates.addDays(hoje(), 30)).sort((a, b) => a.a.prox.localeCompare(b.a.prox));
    Dash.kpis('#k-ms', [
      { label: 'Para celebrar', value: fmt.num(pendentes.length, 0), cls: pendentes.length ? 'alerta' : '', sub: pendentes.length ? 'conquistas sem celebração registrada' : 'tudo celebrado' },
      { label: 'Conquistas em 30 dias', value: fmt.num(mes.length, 0), sub: 'atingidas no último mês' },
      { label: 'Aniversários nos próximos 30 dias', value: fmt.num(em30.length, 0),
        sub: em30.slice(0, 3).map(x => `${esc(x.c.nome_loja || x.c.nome_cliente)} (${fmt.date(x.a.prox).slice(0, 5)})`).join(', ') || 'nenhum' },
    ]);
    $('#celebrar').innerHTML = pendentes.length ? pendentes.map(a => `<div class="card ms-item">
        <div class="ms-item-txt"><b>${esc(a.rotulo)}</b>
          <span>${esc([a.loja, a.cliente, a.hub].filter(Boolean).join(' · '))}</span>
          <small class="muted">Atingido em ${fmt.date(a.data)}</small></div>
        ${canEdit ? `<button class="btn small primary" data-celebrar="${esc(a.id)}">Marcar como celebrado</button>` : ''}
      </div>`).join('')
      : '<p class="muted ms-vazio">Nenhuma conquista esperando celebração.</p>';
    $$('[data-celebrar]').forEach(b => b.addEventListener('click', async () => {
      const a = avisos.find(x => x.id === b.dataset.celebrar);
      b.disabled = true;
      try {
        Object.assign(a, { celebrado_em: new Date().toISOString(), celebrado_por: Store.perfil().nome || Store.getSession()?.email || 'Equipe' });
        await Store.save('milestone_avisos', a);
        toast('Conquista marcada como celebrada', 'ok');
        render();
      } catch (e) { b.disabled = false; toast(e.message, 'error'); }
    }));
  }

  // ---------- tabela de clientes ----------
  const chip = (iso, extra = '') => `<span class="ms-chip">${fmt.date(iso)}${extra ? ` <small>${esc(extra)}</small>` : ''}</span>`;
  function celulaManual(c, marco) {
    const chave = `${c.id}|${marco}`, v = datas[c.id]?.[marco];
    if (editando === chave) return `<div class="ms-edit"><input class="input" type="date" data-data="${esc(chave)}" value="${esc(v || '')}" max="${hoje()}">
      ${v ? `<button class="link-btn danger" data-limpar="${esc(chave)}">limpar</button>` : ''}<button class="link-btn" data-cancelar>cancelar</button></div>`;
    if (v) return `${chip(v)}${canEdit ? ` <button class="link-btn ms-alt" data-editar="${esc(chave)}">alterar</button>` : ''}`;
    return canEdit ? `<button class="btn small ghost" data-editar="${esc(chave)}">Lançar data</button>` : '<span class="muted">—</span>';
  }
  function renderTabela() {
    const q = norm($('#busca').value), hub = $('#f-hub').value;
    const lista = clientes.filter(c => (!hub || c.hub === hub) && (!q || norm(`${c.nome_loja} ${c.nome_cliente}`).includes(q)))
      .sort((a, b) => Number(saiu(a)) - Number(saiu(b)) || String(a.nome_loja || '').localeCompare(String(b.nome_loja || '')));
    $('#t-ms').innerHTML = lista.map(c => {
      const ent = entradaDe(c), a = anos(ent), auto = avisoDe(c.id, 'novo_hub');
      const anosTxt = !a ? '<span class="muted">—</span>' : a.n
        ? `<span class="ms-chip">${a.n} ${a.n === 1 ? 'ano' : 'anos'}</span> <small class="muted">próximo: ${fmt.date(a.prox)}</small>`
        : `<small class="muted">completa 1 ano em ${fmt.date(a.prox)}</small>`;
      return `<tr class="${saiu(c) ? 'ms-saiu' : ''}">
        <td><b>${esc(c.nome_loja || '—')}</b><small class="muted ms-sub">${esc([c.nome_cliente, c.hub].filter(Boolean).join(' · '))}${saiu(c) ? ' · saiu' : ''}</small></td>
        <td>${ent ? chip(ent) : '<span class="muted">sem data</span>'}</td>
        <td>${celulaManual(c, 'pedidos_1000')}</td>
        <td>${anosTxt}</td>
        <td>${celulaManual(c, 'faturado_1mm')}</td>
        <td>${auto && !datas[c.id]?.novo_hub ? chip(auto.data, 'automático') : celulaManual(c, 'novo_hub')}</td>
        <td>${celulaManual(c, 'super')}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">Nenhum cliente cadastrado na aba Clientes.</td></tr>';

    $$('[data-editar]').forEach(b => b.addEventListener('click', () => { editando = b.dataset.editar; renderTabela(); $(`[data-data="${CSS.escape(editando)}"]`)?.focus(); }));
    $$('[data-cancelar]').forEach(b => b.addEventListener('click', () => { editando = null; renderTabela(); }));
    $$('[data-limpar]').forEach(b => b.addEventListener('click', () => salvarData(b.dataset.limpar, null)));
    $$('[data-data]').forEach(i => i.addEventListener('change', () => { if (i.value) salvarData(i.dataset.data, i.value); }));
  }

  async function salvarData(chave, valor) {
    const [id, marco] = chave.split('|');
    const reg = { ...(datas[id] || { id }) };
    if (valor) reg[marco] = valor; else delete reg[marco];
    try {
      await Store.save('milestones', reg);
      datas[id] = reg;
      editando = null;
      toast(valor ? `${MANUAIS[marco]}: ${fmt.date(valor)}` : 'Data removida', 'ok');
      // registra a conquista e avisa o CS e o gestor na hora (no modo local não há banco: só salva)
      if (valor && Store.isRemote()) {
        try {
          const n = await Store.rpc('verificar_milestones_agora');
          if (n) toast('Conquista registrada: o CS e o gestor foram avisados', 'ok');
          avisos = await Store.list('milestone_avisos');
        } catch { /* a verificação das 8h registra de qualquer forma */ }
      }
      render();
    } catch (e) { toast(e.message, 'error'); }
  }

  $('#busca').addEventListener('input', renderTabela);
  $('#f-hub').addEventListener('change', renderTabela);
  carregar();
})();
