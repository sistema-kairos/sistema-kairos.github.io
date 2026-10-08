// CRM do comercial: quadro Kanban de negociações (tabela 'crm') com painel de detalhes.
// Cada resposta do formulário público cria uma negociação em "Sem contato" (função enviar_lead).
(() => {
  if (window.SEM_ACESSO) return;

  const ETAPAS = ['Sem contato', 'Contato feito', 'Identificação de interesse', 'Reunião inicial', 'Visita', 'Em negociação', 'Negócio fechado'];
  const PERDIDO = 'Perdido';
  const FECHADO = 'Negócio fechado';
  const QUALIFICACAO = ['Q1', 'Q3', 'Q5'];
  const PEDIDOS = ['Mais de 400 pedidos', 'De 150 a 400', 'De 60 a 150', 'Menos de 60'];
  const MOTIVOS = ['Sem resposta', 'Preço', 'Escolheu concorrente', 'Fora do perfil (ICP)', 'Desistiu do projeto', 'Momento errado', 'Outro'];
  const FONTES = ['Formulário - Mídias sociais', 'Indicação', 'Evento', 'Instagram', 'WhatsApp', 'Prospecção ativa', 'Site'];
  const HUBS_CRM = window.APP_CONFIG.hubs || [];
  // Perdidos: a negociação fica com etapa 'Perdido' e perdido_etapa = etapa em que foi perdida.
  // No quadro, cada etapa tem sua coluna de perda no fim do funil: "Perdido [Contato feito]", etc.
  const ETAPAS_PERDA = ETAPAS.filter(e => e !== FECHADO);
  const perdidoLabel = e => `Perdido [${e || 'Sem etapa'}]`;
  const etapaDoLabel = l => (String(l).match(/^Perdido \[(.*)\]$/) || [])[1];
  const colunaDe = d => d.etapa === PERDIDO ? perdidoLabel(d.perdido_etapa) : (d.etapa || ETAPAS[0]);
  const etapaHist = h => h.etapa === PERDIDO ? perdidoLabel(h.perdido_em) : h.etapa;

  const canEdit = Store.podeEditar('crm');
  const eu = (() => { const p = Store.perfil(); return p.nome || (Store.getSession()?.email || '').split('@')[0] || 'Equipe'; })();
  let deals = [];
  let openId = null;
  let dragging = false;
  let saveTimer = null;
  const board = $('#board'), drawer = $('#drawer');

  if (!canEdit) {
    $('#nova').replaceWith(Object.assign(document.createElement('span'), { className: 'badge neutral', textContent: 'Somente visualização' }));
    $('#importar')?.remove();
  }

  // ---------- utilidades ----------
  const get = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  function set(o, path, v) {
    const ks = path.split('.');
    let x = o;
    ks.slice(0, -1).forEach((k, i) => { if (x[k] == null) x[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; x = x[k]; });
    x[ks[ks.length - 1]] = v;
  }
  const now = () => new Date().toISOString();
  const diasDesde = iso => iso ? Math.max(0, Math.floor((Date.now() - new Date(iso)) / 86400000)) : null;
  const digits = s => String(s || '').replace(/\D/g, '');
  const waLink = tel => { const d = digits(tel); return d.length >= 10 ? `https://wa.me/${d.length <= 11 ? '55' + d : d}` : null; };
  const iniciais = n => String(n || '').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const empresaDe = d => d.empresa || {};
  const contatosDe = d => (d.contatos && d.contatos.length ? d.contatos : [{}]);
  const ICON = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5Z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0Z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>',
    cold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/><path d="M16 2h6v6M22 2l-7 7"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
    door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h3M13 20h9M10 12v.01"/><path d="M13 4.6v16.2a1 1 0 0 1-1.2 1l-5-1.2A1 1 0 0 1 6 19.6V5.6a2 2 0 0 1 1.6-2l3-.6A2 2 0 0 1 13 4.6Z"/></svg>',
    task: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/></svg>',
  };

  // ---------- tarefas ----------
  // Ficam dentro da negociação (d.tarefas), com as mesmas permissões do CRM:
  // { id, tipo, titulo, data 'AAAA-MM-DD', hora 'HH:MM', responsavel, notas, resultado, concluida, concluida_em, concluida_por, criada_em, criada_por }
  // resultado (só ligações): 'Atendida' | 'Não atendida' — alimenta o quadro "Coleta de dados" das Sprints
  const TIPOS_TAREFA = [
    { tipo: 'Ligação', icon: 'phone' }, { tipo: 'Cold call', icon: 'cold' }, { tipo: 'Follow up', icon: 'repeat' },
    { tipo: 'Visita', icon: 'pin' }, { tipo: 'Porta a porta', icon: 'door' }, { tipo: 'Reunião', icon: 'users' }, { tipo: 'WhatsApp', icon: 'wa' },
    { tipo: 'E-mail', icon: 'mail' }, { tipo: 'Outro', icon: 'task' },
  ];
  const LIGACAO = ['Ligação', 'Cold call'];
  const iconeTarefa = t => ICON[(TIPOS_TAREFA.find(x => x.tipo === t.tipo) || TIPOS_TAREFA[TIPOS_TAREFA.length - 1]).icon];
  const tarefasDe = d => d.tarefas || [];
  const horaAgora = () => new Date().toTimeString().slice(0, 5);
  const quando = t => `${t.data || '9999-12-31'} ${t.hora || '99:99'}`;
  const pendentes = d => tarefasDe(d).filter(t => !t.concluida).sort((a, b) => quando(a).localeCompare(quando(b)));
  function situacao(t) {
    if (t.concluida) return 'feita';
    const hoje = dates.today();
    if (!t.data) return 'sem-data';
    if (t.data < hoje || (t.data === hoje && t.hora && t.hora < horaAgora())) return 'atrasada';
    return t.data === hoje ? 'hoje' : 'futura';
  }
  function quandoTexto(t) {
    if (!t.data) return 'Sem data';
    const hoje = dates.today();
    const dia = t.data === hoje ? 'Hoje' : t.data === dates.addDays(hoje, 1) ? 'Amanhã' : t.data === dates.addDays(hoje, -1) ? 'Ontem' : fmt.date(t.data);
    return t.hora ? `${dia}, ${t.hora}` : dia;
  }
  const tituloTarefa = t => t.titulo || t.tipo;

  // ---------- dados ----------
  async function load() {
    try { deals = await Store.list('crm'); }
    catch (e) { toast('Erro ao carregar o CRM: ' + e.message, 'error'); deals = []; }
    fillFilters();
    render();
  }

  async function persist(d) {
    d.updated_at = now();
    try { await Store.save('crm', d); }
    catch (e) { toast(e.message, 'error'); }
  }
  function scheduleSave(d) {
    clearTimeout(saveTimer);
    const ind = $('.save-state', drawer);
    if (ind) ind.textContent = 'Salvando…';
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      await persist(d);
      const i = $('.save-state', drawer);
      if (i) i.textContent = 'Salvo';
      render();
    }, 500);
  }

  async function mover(d, etapa, etapaPerda = null) {
    if (!canEdit) return;
    if (d.etapa === etapa && (etapa !== PERDIDO || (etapaPerda && etapaPerda === d.perdido_etapa))) return;
    if (etapa === PERDIDO) {
      const perda = await pedirMotivo(d, etapaPerda);
      if (!perda) return;
      d.perdido_etapa = perda.etapa;
      d.motivo_perda = perda.motivo;
      d.motivo_detalhe = perda.detalhe || null;
    } else if (d.etapa === PERDIDO) {
      d.perdido_etapa = null; d.motivo_perda = null; d.motivo_detalhe = null;
    }
    d.etapa = etapa;
    d.etapa_desde = now();
    (d.historico = d.historico || []).push({ etapa, em: now(), por: eu, ...(etapa === PERDIDO ? { perdido_em: d.perdido_etapa, motivo: d.motivo_perda } : {}) });
    await persist(d);
    render();
    if (openId === d.id) renderDrawer();
    toast(etapa === PERDIDO ? `Movida para ${perdidoLabel(d.perdido_etapa)}` : `Movida para ${etapa}`, 'ok');
  }

  function pedirMotivo(d, etapaPerda) {
    const atual = d.etapa === PERDIDO ? d.perdido_etapa : d.etapa;
    const sugerida = etapaPerda || (ETAPAS_PERDA.includes(atual) ? atual : ETAPAS_PERDA[ETAPAS_PERDA.length - 1]);
    return new Promise(resolve => {
      let result = null;
      const dlg = openModal({
        title: 'Marcar como perdido',
        body: `<p>Em qual etapa a negociação foi perdida e qual foi o motivo?</p>
          <div class="form-grid">
            <label class="field wide"><span>Perdido em *</span><select class="input" name="etapa">${ETAPAS_PERDA.map(e =>
              `<option value="${esc(e)}" ${e === sugerida ? 'selected' : ''}>${esc(perdidoLabel(e))}</option>`).join('')}</select></label>
            <label class="field wide"><span>Motivo *</span><select class="input" name="motivo">${MOTIVOS.map(m => `<option ${m === d.motivo_perda ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
            <label class="field wide"><span>Detalhes</span><textarea class="input" rows="3" name="detalhe" placeholder="Opcional"></textarea></label>
          </div>`,
        actions: [
          { label: 'Cancelar', cls: 'ghost' },
          { label: 'Marcar como perdido', cls: 'primary', onClick: dl => { result = { etapa: $('[name=etapa]', dl).value, motivo: $('[name=motivo]', dl).value, detalhe: $('[name=detalhe]', dl).value.trim() }; } },
        ],
      });
      dlg.addEventListener('close', () => resolve(result));
    });
  }

  async function nova() {
    const d = {
      id: Store.uid(), titulo: 'Nova negociação', etapa: ETAPAS[0], etapa_desde: now(), criado_em: now(),
      contatos: [{}], empresa: {}, responsavel: eu, historico: [{ etapa: ETAPAS[0], em: now(), por: eu }],
    };
    deals.unshift(d);
    await persist(d);
    render();
    abrir(d.id, true);
  }

  // ---------- quadro ----------
  function filtrados() {
    const q = norm($('#busca').value);
    const resp = $('#f-resp').value, fonte = $('#f-fonte').value, qual = $('#f-qual').value, tar = $('#f-tarefa').value;
    return deals.filter(d => {
      if (tar) {
        const sts = pendentes(d).map(situacao);
        if (tar === 'atrasadas' && !sts.includes('atrasada')) return false;
        if (tar === 'hoje' && !sts.some(x => x === 'hoje' || x === 'atrasada')) return false;
        if (tar === 'sem' && (sts.length || d.etapa === PERDIDO || d.etapa === FECHADO)) return false;
      }
      if (resp && (d.responsavel || '') !== resp) return false;
      if (qual && (d.qualificacao || 'sem') !== qual) return false;
      if (fonte && (d.fonte || '') !== fonte) return false;
      if (!q) return true;
      const txt = [d.titulo, d.fonte, d.campanha, d.responsavel, empresaDe(d).nome, empresaDe(d).loja_ifood,
        ...contatosDe(d).flatMap(c => [c.nome, c.telefone, c.email])].map(norm).join(' ');
      return txt.includes(q) || (digits(q).length >= 4 && contatosDe(d).some(c => digits(c.telefone).includes(digits(q))));
    });
  }

  function fillFilters() {
    const opts = (sel, label, vals) => {
      const cur = sel.value;
      sel.innerHTML = `<option value="">${label}</option>` + [...new Set(vals.filter(Boolean))].sort().map(v => `<option>${esc(v)}</option>`).join('');
      sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
    };
    opts($('#f-resp'), 'Responsável: todos', deals.map(d => d.responsavel));
    opts($('#f-fonte'), 'Fonte: todas', deals.map(d => d.fonte));
  }

  function cardHTML(d) {
    const emp = empresaDe(d);
    const dias = diasDesde(d.etapa_desde);
    const q = d.qualificacao ? `<span class="tag q-${norm(d.qualificacao)}">${esc(d.qualificacao)}</span>` : '';
    const fonte = d.fonte ? `<span class="tag">${esc(d.fonte.replace('Formulário - ', 'Form. '))}</span>` : '';
    const perda = d.etapa === PERDIDO && d.motivo_perda ? `<div class="deal-lost">${esc(d.motivo_perda)}</div>` : '';
    return `<article class="deal" data-id="${esc(d.id)}" ${canEdit ? 'draggable="true"' : ''} tabindex="0">
      <div class="deal-title">${esc(d.titulo || 'Sem nome')}</div>
      ${emp.nome || emp.hub ? `<div class="deal-sub">${esc([emp.nome, emp.hub].filter(Boolean).join(' · '))}</div>` : ''}
      ${q || fonte ? `<div class="deal-tags">${q}${fonte}</div>` : ''}
      ${perda}
      ${(() => {
        const t = pendentes(d)[0];
        if (!t) return '';
        const st = situacao(t), mais = pendentes(d).length - 1;
        return `<div class="deal-task ${st}" title="${st === 'atrasada' ? 'Tarefa atrasada' : 'Próxima tarefa'}">${iconeTarefa(t)}
          <span>${esc(tituloTarefa(t))} · ${esc(quandoTexto(t))}</span>${mais > 0 ? `<b>+${mais}</b>` : ''}</div>`;
      })()}
      <div class="deal-foot">
        <span class="deal-value">${d.valor_total ? fmt.money(d.valor_total) : ''}</span>
        <span class="muted small" title="Tempo nesta etapa">${dias === null ? '' : dias === 0 ? 'hoje' : `há ${dias} d`}</span>
        ${d.responsavel ? `<span class="avatar" title="${esc(d.responsavel)}">${esc(iniciais(d.responsavel))}</span>` : ''}
      </div>
    </article>`;
  }

  function render() {
    const lista = filtrados();
    // colunas de perda: uma por etapa do funil (+ perdas antigas sem etapa registrada, se houver)
    const perdas = [...ETAPAS_PERDA.map(perdidoLabel),
      ...new Set(lista.filter(d => d.etapa === PERDIDO && !ETAPAS_PERDA.includes(d.perdido_etapa)).map(colunaDe))];
    const cols = [...ETAPAS, ...($('#f-perdidos').checked ? perdas : [])];
    const ordem = (a, b) => (b.etapa_desde || '').localeCompare(a.etapa_desde || '');
    board.innerHTML = cols.map((etapa, i) => {
      const ds = lista.filter(d => colunaDe(d) === etapa).sort(ordem);
      const total = ds.reduce((s, d) => s + (Number(d.valor_total) || 0), 0);
      const cls = etapaDoLabel(etapa) !== undefined ? `lost${i === ETAPAS.length ? ' first-lost' : ''}` : etapa === FECHADO ? 'won' : '';
      return `<section class="col ${cls}" data-etapa="${esc(etapa)}">
        <header class="col-head"><span class="col-name">${esc(etapa)}</span><span class="col-count">${ds.length}</span>
          ${total ? `<span class="col-total">${fmt.moneyShort(total)}</span>` : ''}</header>
        <div class="col-body">${ds.map(cardHTML).join('') || '<div class="col-empty">Nenhuma negociação</div>'}</div>
      </section>`;
    }).join('');

    const abertas = lista.filter(d => d.etapa !== PERDIDO && d.etapa !== FECHADO);
    const valorAberto = abertas.reduce((s, d) => s + (Number(d.valor_total) || 0), 0);
    const sts = lista.flatMap(d => pendentes(d).map(situacao));
    const nAtr = sts.filter(x => x === 'atrasada').length, nHoje = sts.filter(x => x === 'hoje').length;
    $('#resumo').innerHTML = `${abertas.length} em aberto · ${esc(fmt.money(valorAberto))} em negociação · ${lista.filter(d => d.etapa === FECHADO).length} fechadas`
      + (nAtr ? ` · <button class="link-btn danger" data-tar="atrasadas">${nAtr} tarefa${nAtr > 1 ? 's' : ''} atrasada${nAtr > 1 ? 's' : ''}</button>` : '')
      + (nHoje ? ` · <button class="link-btn" data-tar="hoje">${nHoje} para hoje</button>` : '');
    $$('[data-tar]', $('#resumo')).forEach(b => b.addEventListener('click', () => { $('#f-tarefa').value = b.dataset.tar; render(); }));
    // métricas por qualificação das negociações em aberto
    const porQ = q => abertas.filter(d => (d.qualificacao || 'sem') === q);
    $('#qualif').innerHTML = [...QUALIFICACAO, 'sem'].map(q => {
      const ds = porQ(q), v = ds.reduce((s, d) => s + (Number(d.valor_total) || 0), 0);
      return `<button class="qcard ${$('#f-qual').value === q ? 'on' : ''}" data-q="${q}" title="Filtrar por ${q === 'sem' ? 'sem qualificação' : q}">
        <span class="tag q-${q === 'sem' ? 'sem' : norm(q)}">${q === 'sem' ? 'Sem qualificação' : q}</span>
        <b>${ds.length}</b><span class="muted small">${abertas.length ? Math.round(ds.length / abertas.length * 100) : 0}% · ${fmt.moneyShort(v)}</span></button>`;
    }).join('');
    $$('.qcard', $('#qualif')).forEach(b => b.addEventListener('click', () => {
      $('#f-qual').value = $('#f-qual').value === b.dataset.q ? '' : b.dataset.q;
      render();
    }));

    $$('.deal', board).forEach(el => {
      el.addEventListener('click', () => abrir(el.dataset.id));
      el.addEventListener('keydown', e => { if (e.key === 'Enter') abrir(el.dataset.id); });
      if (!canEdit) return;
      el.addEventListener('dragstart', e => { dragging = true; e.dataTransfer.setData('text/plain', el.dataset.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
      el.addEventListener('dragend', () => { dragging = false; el.classList.remove('dragging'); });
    });
    if (canEdit) $$('.col', board).forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('over');
        const d = deals.find(x => x.id === e.dataTransfer.getData('text/plain'));
        if (!d) return;
        const perda = etapaDoLabel(col.dataset.etapa);
        if (perda !== undefined) mover(d, PERDIDO, ETAPAS_PERDA.includes(perda) ? perda : null);
        else mover(d, col.dataset.etapa);
      });
    });
  }

  // ---------- painel de detalhes ----------
  const dis = canEdit ? '' : 'disabled';
  function kv(label, path, d, type = 'text', opts = {}) {
    const v = get(d, path) ?? '';
    let input;
    if (type === 'select') {
      input = `<select class="v" data-path="${path}" ${dis}><option value=""></option>${opts.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else if (type === 'readonly' || (!canEdit && type === 'date')) {
      if (type === 'date') opts = { ...opts, text: v ? esc(fmt.date(v)) : '' };
      input = `<span class="v ro">${opts.text ?? esc(v || '—')}</span>`;
    } else {
      const t = type === 'money' ? 'number' : type;
      input = `<input class="v" data-path="${path}" data-type="${type}" type="${t}" ${type === 'money' ? 'step="0.01" min="0" inputmode="decimal"' : ''}
        value="${esc(v)}" placeholder="${canEdit ? esc(opts.placeholder || '') : ''}" ${opts.list ? `list="${opts.list}"` : ''} ${dis}>`;
    }
    return `<label class="kv"><span class="k">${esc(label)}</span>${input}${opts.after || ''}</label>`;
  }

  function contatoHTML(c, i, d) {
    const tel = c.telefone, wa = waLink(tel);
    const p = `contatos.${i}`;
    return `<div class="contato" data-i="${i}">
      <div class="contato-nome">${ICON.user}<input class="v strong" data-path="${p}.nome" value="${esc(c.nome || '')}" placeholder="${canEdit ? 'Nome do contato' : ''}" ${dis}>
        ${canEdit && contatosDe(d).length > 1 ? `<button class="icon-btn small rm-contato" data-i="${i}" title="Remover contato" aria-label="Remover contato">×</button>` : ''}</div>
      <div class="contato-linha"><input class="v link" data-path="${p}.telefone" data-type="tel" value="${esc(tel || '')}" placeholder="Telefone" inputmode="tel" ${dis}>
        ${tel ? `<button class="mini" data-copy="${esc(tel)}" title="Copiar telefone">${ICON.copy}</button>` : ''}
        ${wa ? `<a class="mini wa" href="${wa}" target="_blank" rel="noopener" title="Abrir no WhatsApp">${ICON.wa}</a>` : ''}</div>
      <div class="contato-linha">${ICON.wa}<input class="v" data-path="${p}.whatsapp_usuario" value="${esc(c.whatsapp_usuario || '')}" placeholder="${canEdit ? 'Nome de usuário no WhatsApp' : ''}" ${dis}></div>
      <div class="contato-linha"><input class="v link" data-path="${p}.email" type="email" value="${esc(c.email || '')}" placeholder="E-mail" ${dis}>
        ${c.email ? `<button class="mini" data-copy="${esc(c.email)}" title="Copiar e-mail">${ICON.copy}</button>` : ''}</div>
      <details class="contato-mais"><summary>Informações adicionais</summary>
        ${kv('Cargo', `${p}.cargo`, d)}
        ${kv('Observações', `${p}.info`, d)}
      </details>
    </div>`;
  }

  function secao(titulo, corpo, aberta = true) {
    return `<details class="sec" ${aberta ? 'open' : ''}><summary><h3>${titulo}</h3></summary><div class="sec-body">${corpo}</div></details>`;
  }

  function tarefaHTML(t) {
    const st = situacao(t);
    return `<li class="tarefa ${st}" data-tid="${esc(t.id)}">
      <input type="checkbox" class="tarefa-check" ${t.concluida ? 'checked' : ''} ${dis} title="${t.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'}" aria-label="Concluir ${esc(tituloTarefa(t))}">
      <button class="tarefa-corpo" type="button" ${canEdit ? '' : 'disabled'}>
        <span class="tarefa-ico">${iconeTarefa(t)}</span>
        <span class="tarefa-txt"><span class="tarefa-titulo">${esc(tituloTarefa(t))}</span>
          <span class="tarefa-meta">${t.titulo && t.titulo !== t.tipo ? `${esc(t.tipo)} · ` : ''}${t.resultado ? `${esc(t.resultado)} · ` : ''}${t.concluida
            ? `Concluída ${esc(fmt.dateTime(t.concluida_em))}${t.concluida_por ? ' por ' + esc(t.concluida_por) : ''}`
            : `<span class="tarefa-quando">${st === 'atrasada' ? 'Atrasada · ' : ''}${esc(quandoTexto(t))}</span>`}${t.responsavel ? ` · ${esc(t.responsavel)}` : ''}</span>
          ${t.notas ? `<span class="tarefa-notas">${esc(t.notas)}</span>` : ''}</span>
      </button></li>`;
  }
  function tarefasHTML(d) {
    const pend = pendentes(d);
    const feitas = tarefasDe(d).filter(t => t.concluida).sort((a, b) => (b.concluida_em || '').localeCompare(a.concluida_em || ''));
    return `${canEdit ? `<div class="tarefa-novas">${TIPOS_TAREFA.slice(0, 5).map(x =>
        `<button class="chip" data-nova-tarefa="${esc(x.tipo)}">${ICON[x.icon]}${esc(x.tipo)}</button>`).join('')}
        <button class="chip" data-nova-tarefa="">+ Outra</button></div>` : ''}
      <ul class="tarefas">${pend.map(tarefaHTML).join('') || '<li class="muted small tarefa-vazia">Nenhuma tarefa pendente</li>'}</ul>
      ${feitas.length ? `<details class="tarefas-feitas"><summary>Concluídas (${feitas.length})</summary><ul class="tarefas">${feitas.map(tarefaHTML).join('')}</ul></details>` : ''}`;
  }

  function formTarefa(d, t = null) {
    const nova = !t || !t.id;
    const base = { tipo: 'Ligação', data: dates.today(), responsavel: d.responsavel || eu, ...(t || {}) };
    const resps = [...new Set([eu, d.responsavel, ...deals.map(x => x.responsavel)].filter(Boolean))];
    const dlg = openModal({
      title: nova ? 'Nova tarefa' : 'Editar tarefa',
      body: `<form class="form-grid" novalidate>
        <div class="field wide"><span>Tipo</span><div class="tipo-tarefa">${TIPOS_TAREFA.map(x => `<label class="chip ${x.tipo === base.tipo ? 'on' : ''}">
          <input type="radio" name="tipo" value="${esc(x.tipo)}" ${x.tipo === base.tipo ? 'checked' : ''}>${ICON[x.icon]}${esc(x.tipo)}</label>`).join('')}</div></div>
        <label class="field wide"><span>Título</span><input class="input" name="titulo" value="${esc(base.titulo || '')}" placeholder="Ex.: Ligar para apresentar a proposta (opcional)"></label>
        <label class="field"><span>Data *</span><input class="input" type="date" name="data" value="${esc(base.data || '')}" required></label>
        <label class="field"><span>Hora</span><input class="input" type="time" name="hora" value="${esc(base.hora || '')}"></label>
        <label class="field wide so-ligacao ${LIGACAO.includes(base.tipo) ? '' : 'hidden'}"><span>Resultado da ligação</span>
          <select class="input" name="resultado"><option value="">Ainda não ligou</option>${['Atendida', 'Não atendida'].map(o => `<option ${o === base.resultado ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
        <label class="field wide"><span>Responsável</span><input class="input" name="responsavel" value="${esc(base.responsavel || '')}" list="dl-resp-tarefa">
          <datalist id="dl-resp-tarefa">${resps.map(r => `<option value="${esc(r)}">`).join('')}</datalist></label>
        <label class="field wide"><span>Anotações</span><textarea class="input" name="notas" rows="3" placeholder="O que falar, endereço da visita, combinados…">${esc(base.notas || '')}</textarea></label>
        <div class="field wide atalhos-data"><span class="muted small">Atalhos:</span>
          ${[['Hoje', 0], ['Amanhã', 1], ['Em 3 dias', 3], ['Em 1 semana', 7]].map(([l, n]) => `<button type="button" class="link-btn" data-dias="${n}">${l}</button>`).join('')}</div>
      </form>`,
      actions: [
        ...(!nova ? [{ label: 'Excluir', cls: 'danger left', onClick: async () => {
          if (!confirm('Excluir esta tarefa?')) return false;
          d.tarefas = tarefasDe(d).filter(x => x.id !== t.id);
          await persist(d); renderDrawer(); render();
          toast('Tarefa excluída');
        } }] : []),
        { label: 'Cancelar', cls: 'ghost' },
        { label: nova ? 'Criar tarefa' : 'Salvar', cls: 'primary', onClick: async dl => {
          const f = $('form', dl);
          if (!f.reportValidity()) return false;
          const v = k => f.elements[k].value.trim() || null;
          const dados = { tipo: f.elements.tipo.value, titulo: v('titulo'), data: v('data'), hora: v('hora'), responsavel: v('responsavel'), notas: v('notas'),
            resultado: LIGACAO.includes(f.elements.tipo.value) ? v('resultado') : null };
          if (nova) d.tarefas = [...tarefasDe(d), { id: Store.uid(), ...dados, concluida: false, criada_em: now(), criada_por: eu }];
          else Object.assign(tarefasDe(d).find(x => x.id === t.id), dados);
          await persist(d); renderDrawer(); render();
          toast(nova ? 'Tarefa criada' : 'Tarefa salva', 'ok');
        } },
      ],
    });
    $$('.tipo-tarefa input', dlg).forEach(r => r.addEventListener('change', () => {
      $$('.tipo-tarefa .chip', dlg).forEach(c => c.classList.toggle('on', c.contains(r) ? r.checked : false));
      $('.so-ligacao', dlg).classList.toggle('hidden', !LIGACAO.includes(r.value));
    }));
    $$('[data-dias]', dlg).forEach(b => b.addEventListener('click', () => { $('[name=data]', dlg).value = dates.addDays(dates.today(), +b.dataset.dias); }));
    if (nova) setTimeout(() => $('[name=titulo]', dlg)?.focus(), 50);
  }

  function perguntarResultado(t) {
    return new Promise(resolve => {
      let r = null;
      const dlg = openModal({
        title: `${t.tipo} concluída`,
        body: `<p>A ligação <b>${esc(tituloTarefa(t))}</b> foi atendida?</p>`,
        actions: [
          { label: 'Pular', cls: 'ghost' },
          { label: 'Não atendida', cls: '', onClick: () => { r = 'Não atendida'; } },
          { label: 'Atendida', cls: 'primary', onClick: () => { r = 'Atendida'; } },
        ],
      });
      dlg.addEventListener('close', () => resolve(r));
    });
  }

  async function concluirTarefa(d, t, feita) {
    if (feita && LIGACAO.includes(t.tipo) && !t.resultado) t.resultado = await perguntarResultado(t);
    Object.assign(t, feita ? { concluida: true, concluida_em: now(), concluida_por: eu } : { concluida: false, concluida_em: null, concluida_por: null });
    await persist(d);
    renderDrawer(); render();
    if (feita) {
      toast(`Tarefa concluída: ${tituloTarefa(t)}`, 'ok');
      if (!pendentes(d).length && d.etapa !== PERDIDO && d.etapa !== FECHADO && confirm('Tarefa concluída! Quer agendar a próxima tarefa desta negociação?')) {
        formTarefa(d, { tipo: 'Follow up', data: dates.addDays(dates.today(), 2) });
      }
    }
  }

  function renderDrawer() {
    const d = deals.find(x => x.id === openId);
    if (!d) return fechar();
    const emp = empresaDe(d);
    const etapaIdx = ETAPAS.indexOf(d.etapa);
    const proxima = etapaIdx >= 0 && etapaIdx < ETAPAS.length - 1 ? ETAPAS[etapaIdx + 1] : null;
    const fontes = [...new Set([...FONTES, ...deals.map(x => x.fonte).filter(Boolean)])];
    const resps = [...new Set([eu, ...deals.map(x => x.responsavel).filter(Boolean)])];
    const end = emp.endereco ? `<a class="mini" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(emp.endereco)}" target="_blank" rel="noopener" title="Ver no mapa">${ICON.pin}</a>` : `<span class="mini off">${ICON.pin}</span>`;
    const url = emp.url ? (/^https?:\/\//i.test(emp.url) ? emp.url : 'https://' + emp.url) : null;

    drawer.innerHTML = `
      <div class="drawer-head">
        <div class="drawer-top">
          <select class="v etapa-select" id="etapa" ${dis} aria-label="Etapa">
            <optgroup label="Funil">${ETAPAS.map(e => `<option ${e === colunaDe(d) ? 'selected' : ''}>${esc(e)}</option>`).join('')}</optgroup>
            <optgroup label="Perdidos">${ETAPAS_PERDA.map(perdidoLabel).map(e => `<option ${e === colunaDe(d) ? 'selected' : ''}>${esc(e)}</option>`).join('')}
              ${d.etapa === PERDIDO && !ETAPAS_PERDA.includes(d.perdido_etapa) ? `<option selected>${esc(colunaDe(d))}</option>` : ''}</optgroup></select>
          <span class="save-state muted small"></span>
          <button class="icon-btn" id="fechar" aria-label="Fechar">×</button>
        </div>
        <input class="v drawer-title" data-path="titulo" value="${esc(d.titulo || '')}" placeholder="Nome da negociação" ${dis}>
        ${d.etapa === PERDIDO ? `<div class="deal-lost big"><b>${esc(perdidoLabel(d.perdido_etapa))}</b>${d.motivo_perda ? ' · ' + esc(d.motivo_perda) : ''}${d.motivo_detalhe ? ` — ${esc(d.motivo_detalhe)}` : ''}</div>` : ''}
        ${canEdit ? `<div class="drawer-actions">
          ${proxima ? `<button class="btn primary small" id="avancar">Avançar para ${esc(proxima)} ›</button>` : ''}
          ${d.etapa === PERDIDO ? `<button class="btn small" id="reabrir">Reabrir em ${esc(d.perdido_etapa || ETAPAS[0])}</button>` : `<button class="btn small danger" id="perder">Marcar como perdido</button>`}
        </div>` : ''}
      </div>
      <div class="drawer-body">
        ${secao(`Tarefas${pendentes(d).length ? ` <span class="sec-count">${pendentes(d).length}</span>` : ''}`, tarefasHTML(d))}
        ${secao('Negociação', `
          ${kv('Nome', 'titulo', d)}
          ${kv('Qualificação (SQL)', 'qualificacao', d, 'select', { options: QUALIFICACAO })}
          ${kv('Qualificação MKT (MQL)', 'qualificacao_mkt', d, 'select', { options: QUALIFICACAO })}
          ${kv('Previsão de fechamento', 'previsao_fechamento', d, 'date')}
          ${kv('Fonte', 'fonte', d, 'text', { list: 'dl-fontes' })}
          ${kv('Campanha', 'campanha', d)}
          ${kv('Criada em', 'criado_em', d, 'readonly', { text: esc(fmt.dateTime(d.criado_em)) })}
          ${kv('Valor total', 'valor_total', d, 'money', { placeholder: 'R$ 0,00' })}
          ${kv('Instagram', 'instagram', d, 'text', { placeholder: '@perfil' })}
          ${kv('Número de pedidos', 'num_pedidos', d, 'select', { options: PEDIDOS })}
          ${kv('Interesse em', 'interesse', d)}
          ${kv('Delivery hoje', 'situacao_delivery', d, 'select', { options: ['Já vendo por delivery', 'Parei com o delivery', 'Nunca vendi'] })}
          ${kv('Vende em apps', 'vende_apps', d, 'select', { options: ['Sim, vendo nos apps', 'Não vendo por apps'] })}
          ${kv('Quer começar', 'prazo_inicio', d, 'select', { options: ['Imediatamente', 'Entre 1 e 3 meses', 'Acima de 3 meses'] })}
          <datalist id="dl-fontes">${fontes.map(f => `<option value="${esc(f)}">`).join('')}</datalist>`)}
        ${secao('Contatos', `${contatosDe(d).map((c, i) => contatoHTML(c, i, d)).join('')}
          ${canEdit ? '<button class="btn ghost small add-contato" id="add-contato">+ Adicionar contato</button>' : ''}`)}
        ${secao('Empresa', `
          ${kv('Nome', 'empresa.nome', d)}
          ${kv('Segmento', 'empresa.segmento', d, 'text', { placeholder: 'Ex.: japonesa, doces, hambúrguer' })}
          ${kv('URL', 'empresa.url', d, 'text', { placeholder: 'site.com.br' })}
          ${kv('Endereço', 'empresa.endereco', d, 'text', { after: end })}
          ${kv('Produto', 'empresa.produto', d)}
          ${kv('Qual HUB?', 'empresa.hub', d, 'select', { options: HUBS_CRM })}
          ${kv('Número de pedidos', 'empresa.num_pedidos', d, 'select', { options: PEDIDOS })}
          ${kv('Loja no iFood', 'empresa.loja_ifood', d)}
          ${kv('Instagram', 'empresa.instagram', d, 'text', { placeholder: '@perfil' })}
          ${url ? `<a class="sec-link" href="${esc(url)}" target="_blank" rel="noopener">Abrir site da empresa ${ICON.ext}</a>` : ''}`)}
        ${secao('Responsável', `${kv('Responsável', 'responsavel', d, 'text', { list: 'dl-resp' })}
          <datalist id="dl-resp">${resps.map(r => `<option value="${esc(r)}">`).join('')}</datalist>`)}
        ${secao('Anotações', `<textarea class="v notes" data-path="anotacoes" rows="5" placeholder="Ideia de negócio, próximos passos, combinados…" ${dis}>${esc(d.anotacoes || '')}</textarea>`)}
        ${secao('Histórico', `<ol class="hist">${(d.historico || []).slice().reverse().map(h => `
          <li><b>${esc(etapaHist(h))}</b>${h.motivo ? ` · ${esc(h.motivo)}` : ''}<span class="muted small">${esc(fmt.dateTime(h.em))}${h.por ? ' · ' + esc(h.por) : ''}</span></li>`).join('') || '<li class="muted">Sem movimentações</li>'}</ol>`, false)}
        ${canEdit ? '<button class="btn ghost small danger excluir" id="excluir">Excluir negociação</button>' : ''}
      </div>`;
    bindDrawer(d);
  }

  function bindDrawer(d) {
    $('#fechar', drawer).addEventListener('click', fechar);
    $$('[data-nova-tarefa]', drawer).forEach(b => b.addEventListener('click', e => { e.preventDefault(); formTarefa(d, { tipo: b.dataset.novaTarefa || 'Outro' }); }));
    $$('.tarefa', drawer).forEach(li => {
      const t = tarefasDe(d).find(x => x.id === li.dataset.tid);
      $('.tarefa-check', li).addEventListener('change', e => concluirTarefa(d, t, e.target.checked));
      if (canEdit) $('.tarefa-corpo', li).addEventListener('click', () => formTarefa(d, t));
    });
    $('#etapa', drawer)?.addEventListener('change', e => {
      const v = e.target.value, perda = etapaDoLabel(v);
      e.target.value = colunaDe(d);
      if (perda !== undefined) mover(d, PERDIDO, ETAPAS_PERDA.includes(perda) ? perda : null); else mover(d, v);
    });
    $('#avancar', drawer)?.addEventListener('click', () => mover(d, ETAPAS[ETAPAS.indexOf(d.etapa) + 1]));
    $('#perder', drawer)?.addEventListener('click', () => mover(d, PERDIDO));
    $('#reabrir', drawer)?.addEventListener('click', () => mover(d, ETAPAS.includes(d.perdido_etapa) ? d.perdido_etapa : ETAPAS[0]));
    $('#add-contato', drawer)?.addEventListener('click', () => { d.contatos = [...contatosDe(d), {}]; scheduleSave(d); renderDrawer(); });
    $$('.rm-contato', drawer).forEach(b => b.addEventListener('click', () => {
      if (!confirm('Remover este contato?')) return;
      d.contatos = contatosDe(d).filter((_, i) => i !== +b.dataset.i);
      scheduleSave(d); renderDrawer();
    }));
    $('#excluir', drawer)?.addEventListener('click', async () => {
      if (!confirm('Excluir esta negociação definitivamente?')) return;
      try { await Store.remove('crm', d.id); deals = deals.filter(x => x.id !== d.id); fechar(); render(); toast('Negociação excluída'); }
      catch (e) { toast(e.message, 'error'); }
    });
    $$('[data-copy]', drawer).forEach(b => b.addEventListener('click', async e => {
      e.preventDefault();
      try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado', 'ok'); } catch { prompt('Copie:', b.dataset.copy); }
    }));
    $$('[data-type="tel"]', drawer).forEach(i => i.addEventListener('input', () => { i.value = maskPhone(i.value); }));
    // salva automaticamente cada campo alterado
    $$('[data-path]', drawer).forEach(i => i.addEventListener('change', () => {
      const raw = i.value.trim();
      const v = i.dataset.type === 'money' ? parse.num(raw) : (raw || null);
      set(d, i.dataset.path, v);
      if (i.dataset.path === 'titulo') $$('[data-path="titulo"]', drawer).forEach(x => { if (x !== i) x.value = raw; });
      scheduleSave(d);
      // links que dependem do valor (WhatsApp, mapa, site) são atualizados após salvar
      if (/telefone|email|endereco|url/.test(i.dataset.path)) setTimeout(() => { if (openId === d.id && !drawer.contains(document.activeElement)) renderDrawer(); }, 650);
    }));
  }

  function abrir(id, focarTitulo = false) {
    openId = id;
    renderDrawer();
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    $('#backdrop').classList.add('show');
    if (focarTitulo) setTimeout(() => { const t = $('.drawer-title', drawer); t?.focus(); t?.select(); }, 250);
  }
  async function fechar() {
    if (saveTimer) {
      clearTimeout(saveTimer); saveTimer = null;
      const d = deals.find(x => x.id === openId);
      if (d) await persist(d);
    }
    openId = null;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    $('#backdrop').classList.remove('show');
    render();
  }

  // ---------- importar / exportar planilha ----------
  // Colunas reconhecidas pelo nome (sem diferenciar acentos/maiúsculas). Etapas aceitas:
  // "Contato feito", "Perdido [Contato feito]", "Perdido - Contato feito", "Perdido" + coluna "Perdido em"...
  const COLUNAS = [
    { key: 'titulo', label: 'Negociação', aliases: ['nome da negociacao', 'titulo', 'oportunidade', 'negocio', 'nome do negocio', 'deal'] },
    { key: 'etapa', label: 'Etapa', aliases: ['estagio', 'fase', 'status', 'etapa do funil', 'funil'] },
    { key: 'perdido_etapa', label: 'Perdido em', aliases: ['etapa da perda', 'perdido na etapa'] },
    { key: 'motivo_perda', label: 'Motivo da perda', aliases: ['motivo de perda', 'motivo'] },
    { key: 'contato.nome', label: 'Contato', aliases: ['nome do contato', 'nome', 'lead', 'nome do lead', 'cliente'] },
    { key: 'contato.telefone', label: 'Telefone', aliases: ['celular', 'whatsapp', 'fone', 'telefone do contato'] },
    { key: 'contato.email', label: 'E-mail', aliases: ['email', 'email do contato'] },
    { key: 'empresa.nome', label: 'Empresa', aliases: ['loja', 'nome da loja', 'nome da empresa', 'marca', 'restaurante'] },
    { key: 'empresa.hub', label: 'Hub', aliases: ['qual hub'] },
    { key: 'empresa.segmento', label: 'Segmento', aliases: [] },
    { key: 'fonte', label: 'Fonte', aliases: ['origem', 'canal', 'fonte do lead'] },
    { key: 'campanha', label: 'Campanha', aliases: ['utm campaign', 'utm_campaign'] },
    { key: 'valor_total', label: 'Valor', aliases: ['valor total', 'valor da negociacao', 'mensalidade', 'valor estimado'], type: 'money' },
    { key: 'qualificacao', label: 'Qualificação', aliases: ['qualificacao sql', 'sql'] },
    { key: 'qualificacao_mkt', label: 'Qualificação MKT', aliases: ['qualificacao mql', 'mql'] },
    { key: 'previsao_fechamento', label: 'Previsão de fechamento', aliases: ['previsao'], type: 'date' },
    { key: 'responsavel', label: 'Responsável', aliases: ['vendedor', 'dono', 'proprietario', 'owner', 'closer', 'sdr'] },
    { key: 'criado_em', label: 'Criada em', aliases: ['criado em', 'data de criacao', 'data de entrada', 'data', 'data do lead'], type: 'date' },
    { key: 'instagram', label: 'Instagram', aliases: [] },
    { key: 'num_pedidos', label: 'Número de pedidos', aliases: ['pedidos', 'pedidos mes', 'pedidos por mes'] },
    { key: 'anotacoes', label: 'Anotações', aliases: ['observacoes', 'notas', 'obs', 'observacao'] },
  ];
  const ALIAS_ETAPA = { novo: 'Sem contato', lead: 'Sem contato', reuniao: 'Reunião inicial', negociacao: 'Em negociação',
    fechado: FECHADO, ganho: FECHADO, ganha: FECHADO, fechamento: FECHADO, interesse: 'Identificação de interesse' };
  function acharEtapa(txt) {
    const n = norm(txt);
    if (!n) return null;
    return ETAPAS.find(e => norm(e) === n) || ALIAS_ETAPA[n]
      || ETAPAS.find(e => n.includes(norm(e)) || norm(e).includes(n)) || null;
  }
  // devolve { etapa, perdido_etapa?, desconhecida? }
  function lerEtapa(raw, perdidoCol) {
    const s = String(raw || '').trim();
    if (!s) return { etapa: ETAPAS[0] };
    const m = s.match(/^perdid[oa]s?\b\s*[-–:]?\s*(.*)$/i);
    if (m) {
      const dentro = m[1].replace(/^[[(]\s*|\s*[\])]$/g, '').trim() || String(perdidoCol || '').trim();
      const e = acharEtapa(dentro);
      return { etapa: PERDIDO, perdido_etapa: e && e !== FECHADO ? e : null, desconhecida: dentro && !e ? s : null };
    }
    const e = acharEtapa(s);
    return e ? { etapa: e } : { etapa: ETAPAS[0], desconhecida: s };
  }
  const QUALIF = v => QUALIFICACAO.find(q => norm(q) === norm(v)) || null;
  const dataISO = v => { const d = parse.date(v); return d ? new Date(`${d}T12:00:00`).toISOString() : null; };

  function montarImportacao(texto, pularDuplicados) {
    texto = texto.replace(/^﻿/, '');
    if (!texto.trim()) return null;
    const primeira = texto.split(/\r?\n/)[0];
    const delim = primeira.includes('\t') ? '\t' : (primeira.split(';').length >= primeira.split(',').length ? ';' : ',');
    const linhas = parseDelimited(texto, delim);
    if (linhas.length < 2) return null;
    const lookup = {};
    COLUNAS.forEach(c => [c.label, c.key, ...c.aliases].forEach(n => { lookup[norm(n)] ??= c; }));
    const cab = linhas[0];
    const mapa = cab.map(h => lookup[norm(h)] || null);
    // evita a mesma coluna da planilha preencher dois campos
    const usados = new Set();
    mapa.forEach((c, i) => { if (c && usados.has(c.key)) mapa[i] = null; else if (c) usados.add(c.key); });

    const existentes = new Set(deals.flatMap(d => contatosDe(d).flatMap(c => [digits(c.telefone).slice(-8), norm(c.email)])).filter(x => x && x.length >= 6));
    const desconhecidas = {}, porColuna = {};
    let duplicados = 0;
    const registros = [];
    for (const l of linhas.slice(1)) {
      if (!l.some(c => c.trim())) continue;
      const v = {};
      mapa.forEach((c, i) => { const x = (l[i] || '').trim(); if (c && x) v[c.key] = x; });
      const chaves = [digits(v['contato.telefone']).slice(-8), norm(v['contato.email'])].filter(x => x && x.length >= 6);
      if (chaves.some(k => existentes.has(k))) { duplicados++; if (pularDuplicados) continue; }
      chaves.forEach(k => existentes.add(k));

      const et = lerEtapa(v.etapa, v.perdido_etapa);
      if (et.desconhecida) desconhecidas[et.desconhecida] = (desconhecidas[et.desconhecida] || 0) + 1;
      const criado = dataISO(v.criado_em) || now();
      const titulo = v.titulo || [v['contato.nome'], v['empresa.nome']].filter(Boolean).join(' - ') || 'Negociação importada';
      const limpa = o => Object.fromEntries(Object.entries(o).filter(([, x]) => !isBlank(x)));
      const d = limpa({
        id: Store.uid(), titulo, etapa: et.etapa, etapa_desde: criado, criado_em: criado,
        perdido_etapa: et.perdido_etapa, motivo_perda: et.etapa === PERDIDO ? v.motivo_perda : null,
        fonte: v.fonte, campanha: v.campanha, valor_total: parse.num(v.valor_total),
        qualificacao: QUALIF(v.qualificacao), qualificacao_mkt: QUALIF(v.qualificacao_mkt), previsao_fechamento: parse.date(v.previsao_fechamento),
        responsavel: v.responsavel || eu, instagram: v.instagram, num_pedidos: v.num_pedidos,
        anotacoes: [v.anotacoes, et.desconhecida ? `Etapa na planilha: ${et.desconhecida}` : null].filter(Boolean).join('\n') || null,
        importado_em: now(),
      });
      d.contatos = [limpa({ nome: v['contato.nome'], telefone: v['contato.telefone'] ? maskPhone(v['contato.telefone']) : null, email: v['contato.email'] })];
      d.empresa = limpa({ nome: v['empresa.nome'], hub: HUBS_CRM.find(h => norm(h) === norm(v['empresa.hub'])) || v['empresa.hub'], segmento: v['empresa.segmento'] });
      d.historico = [{ etapa: d.etapa, em: criado, por: 'Importação', ...(d.etapa === PERDIDO ? { perdido_em: d.perdido_etapa, motivo: d.motivo_perda } : {}) }];
      porColuna[colunaDe(d)] = (porColuna[colunaDe(d)] || 0) + 1;
      registros.push(d);
    }
    return { registros, duplicados, desconhecidas, porColuna,
      reconhecidas: cab.filter((_, i) => mapa[i]), ignoradas: cab.filter((h, i) => !mapa[i] && h.trim()) };
  }

  function abrirImportacao() {
    let res = null;
    const dlg = openModal({
      title: 'Importar negociações de planilha',
      wide: true,
      body: `
        <p>Copie as linhas da planilha (Excel ou Google Sheets) <b>com a linha de cabeçalho</b> e cole abaixo, ou escolha um arquivo CSV.
          As colunas são reconhecidas pelo nome. Na coluna <b>Etapa</b>, use o nome da etapa do funil ou, para perdidos,
          <code>Perdido [Contato feito]</code>.
          <a href="#" id="modelo">Baixar planilha modelo</a></p>
        <textarea class="input mono" rows="7" placeholder="Cole aqui…"></textarea>
        <div class="row"><input type="file" accept=".csv,.tsv,.txt">
          <label class="check"><input type="checkbox" id="pular-dup" checked> Ignorar contatos que já estão no CRM (mesmo telefone ou e-mail)</label></div>
        <div class="import-preview small"></div>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost' },
        { label: 'Importar', cls: 'primary', onClick: async () => {
          if (!res?.registros.length) { toast('Nada para importar'); return false; }
          await Store.saveMany('crm', res.registros);
          toast(`${res.registros.length} negociações importadas`, 'ok');
          await load();
        } },
      ],
    });
    const ta = $('textarea', dlg), prev = $('.import-preview', dlg), pular = $('#pular-dup', dlg);
    const atualizar = () => {
      res = montarImportacao(ta.value, pular.checked);
      if (!res) { prev.innerHTML = ''; return; }
      const etapas = [...ETAPAS, ...ETAPAS_PERDA.map(perdidoLabel)].filter(c => res.porColuna[c])
        .concat(Object.keys(res.porColuna).filter(c => ![...ETAPAS, ...ETAPAS_PERDA.map(perdidoLabel)].includes(c)));
      const desc = Object.entries(res.desconhecidas);
      prev.innerHTML = `
        <p><b>${res.registros.length} negociações</b> prontas para importar${res.duplicados ? ` · ${res.duplicados} já existiam no CRM${pular.checked ? ' (serão ignoradas)' : ' (serão importadas de novo)'}` : ''}.</p>
        ${etapas.length ? `<div class="import-etapas">${etapas.map(c => `<span class="tag ${etapaDoLabel(c) !== undefined ? 'lost' : ''}">${esc(c)}: <b>${res.porColuna[c]}</b></span>`).join('')}</div>` : ''}
        ${desc.length ? `<p class="warn-box">Etapas não reconhecidas (as negociações vão para <b>${esc(ETAPAS[0])}</b> e o nome original fica nas anotações):
          ${desc.map(([e, n]) => `<b>${esc(e)}</b> (${n})`).join(', ')}</p>` : ''}
        <p class="muted">Colunas reconhecidas: ${res.reconhecidas.map(esc).join(', ') || 'nenhuma'}${res.ignoradas.length ? `<br>Colunas ignoradas: ${res.ignoradas.map(esc).join(', ')}` : ''}</p>`;
    };
    ta.addEventListener('input', atualizar);
    pular.addEventListener('change', atualizar);
    $('input[type=file]', dlg).addEventListener('change', async e => { const f = e.target.files[0]; if (f) { ta.value = await f.text(); atualizar(); } });
    $('#modelo', dlg).addEventListener('click', e => {
      e.preventDefault();
      baixarCSV('modelo-importacao-crm.csv', [COLUNAS.map(c => c.label),
        ['Ana - Burger da Ana', 'Contato feito', '', '', 'Ana Souza', '(31) 99999-0000', 'ana@email.com', 'Burger da Ana', 'Savassi', 'Hambúrguer', 'Instagram', '', '2500', 'Q3', 'Q1', '', eu, fmt.date(dates.today()), '@burgerdaana', 'De 150 a 400', ''],
        ['João - Sushi Top', 'Perdido [Identificação de interesse]', '', 'Preço', 'João Lima', '(31) 98888-0000', '', 'Sushi Top', 'Pampulha', 'Japonesa', 'Indicação', '', '3000', 'Q1', 'Q1', '', eu, fmt.date(dates.today()), '', '', '']]);
    });
  }

  function baixarCSV(nome, linhas) {
    const q = x => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const blob = new Blob(['﻿' + linhas.map(l => l.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportar() {
    const val = (d, c) => {
      if (c.key === 'etapa') return colunaDe(d);
      if (c.key.startsWith('contato.')) return contatosDe(d)[0][c.key.slice(8)];
      const v = get(d, c.key);
      if (c.type === 'date') return v ? fmt.date(String(v)) : '';
      if (c.type === 'money') return isBlank(v) ? '' : String(v).replace('.', ',');
      return v;
    };
    baixarCSV(`crm-${dates.today()}.csv`, [COLUNAS.map(c => c.label), ...filtrados().map(d => COLUNAS.map(c => val(d, c)))]);
  }

  // ---------- eventos ----------
  $('#nova')?.addEventListener('click', nova);
  $('#importar')?.addEventListener('click', abrirImportacao);
  $('#exportar')?.addEventListener('click', exportar);
  $('#backdrop').addEventListener('click', fechar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openId && !document.querySelector('dialog[open]')) fechar(); });
  ['busca', 'f-resp', 'f-fonte', 'f-qual', 'f-tarefa', 'f-perdidos'].forEach(id => $('#' + id).addEventListener(id === 'busca' ? 'input' : 'change', render));
  // novos leads do formulário aparecem sozinhos
  setInterval(() => { if (!openId && !dragging && !document.querySelector('dialog[open]') && !document.hidden) load(); }, 30000);

  load().then(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (id && deals.some(d => d.id === id)) abrir(id);
  });
})();
