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

  const canEdit = Store.podeEditar('crm');
  const eu = (() => { const p = Store.perfil(); return p.nome || (Store.getSession()?.email || '').split('@')[0] || 'Equipe'; })();
  let deals = [];
  let openId = null;
  let dragging = false;
  let saveTimer = null;
  const board = $('#board'), drawer = $('#drawer');

  if (!canEdit) $('#nova').replaceWith(Object.assign(document.createElement('span'), { className: 'badge neutral', textContent: 'Somente visualização' }));

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
  };

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

  async function mover(d, etapa) {
    if (!canEdit || d.etapa === etapa) return;
    if (etapa === PERDIDO) {
      const perda = await pedirMotivo(d);
      if (!perda) return;
      d.perdido_etapa = d.etapa;
      d.motivo_perda = perda.motivo;
      d.motivo_detalhe = perda.detalhe || null;
    } else if (d.etapa === PERDIDO) {
      d.perdido_etapa = null; d.motivo_perda = null; d.motivo_detalhe = null;
    }
    d.etapa = etapa;
    d.etapa_desde = now();
    (d.historico = d.historico || []).push({ etapa, em: now(), por: eu, ...(etapa === PERDIDO ? { motivo: d.motivo_perda } : {}) });
    await persist(d);
    render();
    if (openId === d.id) renderDrawer();
    toast(etapa === PERDIDO ? 'Negociação marcada como perdida' : `Movida para ${etapa}`, 'ok');
  }

  function pedirMotivo(d) {
    return new Promise(resolve => {
      let result = null;
      const dlg = openModal({
        title: 'Marcar como perdido',
        body: `<p>Perdido na etapa <b>${esc(d.etapa)}</b>. Qual foi o motivo?</p>
          <div class="form-grid">
            <label class="field wide"><span>Motivo *</span><select class="input" name="motivo">${MOTIVOS.map(m => `<option>${esc(m)}</option>`).join('')}</select></label>
            <label class="field wide"><span>Detalhes</span><textarea class="input" rows="3" name="detalhe" placeholder="Opcional"></textarea></label>
          </div>`,
        actions: [
          { label: 'Cancelar', cls: 'ghost' },
          { label: 'Marcar como perdido', cls: 'primary', onClick: dl => { result = { motivo: $('[name=motivo]', dl).value, detalhe: $('[name=detalhe]', dl).value.trim() }; } },
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
    const resp = $('#f-resp').value, fonte = $('#f-fonte').value, qual = $('#f-qual').value;
    return deals.filter(d => {
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
    const perda = d.etapa === PERDIDO ? `<div class="deal-lost">Perdido em <b>${esc(d.perdido_etapa || '—')}</b>${d.motivo_perda ? ' · ' + esc(d.motivo_perda) : ''}</div>` : '';
    return `<article class="deal" data-id="${esc(d.id)}" ${canEdit ? 'draggable="true"' : ''} tabindex="0">
      <div class="deal-title">${esc(d.titulo || 'Sem nome')}</div>
      ${emp.nome || emp.hub ? `<div class="deal-sub">${esc([emp.nome, emp.hub].filter(Boolean).join(' · '))}</div>` : ''}
      ${q || fonte ? `<div class="deal-tags">${q}${fonte}</div>` : ''}
      ${perda}
      <div class="deal-foot">
        <span class="deal-value">${d.valor_total ? fmt.money(d.valor_total) : ''}</span>
        <span class="muted small" title="Tempo nesta etapa">${dias === null ? '' : dias === 0 ? 'hoje' : `há ${dias} d`}</span>
        ${d.responsavel ? `<span class="avatar" title="${esc(d.responsavel)}">${esc(iniciais(d.responsavel))}</span>` : ''}
      </div>
    </article>`;
  }

  function render() {
    const lista = filtrados();
    const cols = [...ETAPAS, ...($('#f-perdidos').checked ? [PERDIDO] : [])];
    const ordem = (a, b) => (b.etapa_desde || '').localeCompare(a.etapa_desde || '');
    board.innerHTML = cols.map(etapa => {
      const ds = lista.filter(d => (d.etapa || ETAPAS[0]) === etapa).sort(ordem);
      const total = ds.reduce((s, d) => s + (Number(d.valor_total) || 0), 0);
      const cls = etapa === PERDIDO ? 'lost' : etapa === FECHADO ? 'won' : '';
      return `<section class="col ${cls}" data-etapa="${esc(etapa)}">
        <header class="col-head"><span class="col-name">${esc(etapa)}</span><span class="col-count">${ds.length}</span>
          ${total ? `<span class="col-total">${fmt.moneyShort(total)}</span>` : ''}</header>
        <div class="col-body">${ds.map(cardHTML).join('') || '<div class="col-empty">Nenhuma negociação</div>'}</div>
      </section>`;
    }).join('');

    const abertas = lista.filter(d => d.etapa !== PERDIDO && d.etapa !== FECHADO);
    const valorAberto = abertas.reduce((s, d) => s + (Number(d.valor_total) || 0), 0);
    $('#resumo').textContent = `${abertas.length} em aberto · ${fmt.money(valorAberto)} em negociação · ${lista.filter(d => d.etapa === FECHADO).length} fechadas`;
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
        if (d) mover(d, col.dataset.etapa);
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
            ${[...ETAPAS, PERDIDO].map(e => `<option ${e === d.etapa ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
          <span class="save-state muted small"></span>
          <button class="icon-btn" id="fechar" aria-label="Fechar">×</button>
        </div>
        <input class="v drawer-title" data-path="titulo" value="${esc(d.titulo || '')}" placeholder="Nome da negociação" ${dis}>
        ${d.etapa === PERDIDO ? `<div class="deal-lost big">Perdido em <b>${esc(d.perdido_etapa || '—')}</b> · ${esc(d.motivo_perda || '')}${d.motivo_detalhe ? ` — ${esc(d.motivo_detalhe)}` : ''}</div>` : ''}
        ${canEdit ? `<div class="drawer-actions">
          ${proxima ? `<button class="btn primary small" id="avancar">Avançar para ${esc(proxima)} ›</button>` : ''}
          ${d.etapa === PERDIDO ? `<button class="btn small" id="reabrir">Reabrir em ${esc(d.perdido_etapa || ETAPAS[0])}</button>` : `<button class="btn small danger" id="perder">Marcar como perdido</button>`}
        </div>` : ''}
      </div>
      <div class="drawer-body">
        ${secao('Negociação', `
          ${kv('Nome', 'titulo', d)}
          ${kv('Qualificação', 'qualificacao', d, 'select', { options: QUALIFICACAO })}
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
          <li><b>${esc(h.etapa)}</b>${h.motivo ? ` · ${esc(h.motivo)}` : ''}<span class="muted small">${esc(fmt.dateTime(h.em))}${h.por ? ' · ' + esc(h.por) : ''}</span></li>`).join('') || '<li class="muted">Sem movimentações</li>'}</ol>`, false)}
        ${canEdit ? '<button class="btn ghost small danger excluir" id="excluir">Excluir negociação</button>' : ''}
      </div>`;
    bindDrawer(d);
  }

  function bindDrawer(d) {
    $('#fechar', drawer).addEventListener('click', fechar);
    $('#etapa', drawer)?.addEventListener('change', e => { const v = e.target.value; e.target.value = d.etapa; mover(d, v); });
    $('#avancar', drawer)?.addEventListener('click', () => mover(d, ETAPAS[ETAPAS.indexOf(d.etapa) + 1]));
    $('#perder', drawer)?.addEventListener('click', () => mover(d, PERDIDO));
    $('#reabrir', drawer)?.addEventListener('click', () => mover(d, d.perdido_etapa && d.perdido_etapa !== PERDIDO ? d.perdido_etapa : ETAPAS[0]));
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

  // ---------- eventos ----------
  $('#nova')?.addEventListener('click', nova);
  $('#backdrop').addEventListener('click', fechar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openId && !document.querySelector('dialog[open]')) fechar(); });
  ['busca', 'f-resp', 'f-fonte', 'f-qual', 'f-perdidos'].forEach(id => $('#' + id).addEventListener(id === 'busca' ? 'input' : 'change', render));
  // novos leads do formulário aparecem sozinhos
  setInterval(() => { if (!openId && !dragging && !document.querySelector('dialog[open]') && !document.hidden) load(); }, 30000);

  load().then(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (id && deals.some(d => d.id === id)) abrir(id);
  });
})();
