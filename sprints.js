// Sprints semanais (tabela 'sprints', aberta a toda a equipe; Espectadores só leem).
// Cada semana tem dois documentos livres (em branco, com formatação) e o quadro "Coleta de dados", calculado do CRM:
//   's_AAAA-MM-DD'             → semana: { tipo: 'sprint', inicio, fim, dados: { auto, manual, atualizado_em } }
//   'doc_AAAA-MM-DD_sprint'    → documento da sprint:        { tipo: 'doc', sprint, parte: 'sprint', html, editado_por }
//   'doc_AAAA-MM-DD_retro'     → documento da retrospectiva: { tipo: 'doc', sprint, parte: 'retro',  html, editado_por }
// Documentos ficam em registros separados da semana: editar a retrospectiva não sobrescreve a sprint (e vice-versa).
// O HTML é sempre limpo (sanitizar) antes de salvar e antes de exibir.
(() => {
  if (window.SEM_ACESSO) return;

  const TABELA = 'sprints';
  const canEdit = Store.podeEditar(TABELA);
  const lerCRM = Store.podeLer('crm');
  const eu = (() => { const p = Store.perfil(); return p.nome || (Store.getSession()?.email || '').split('@')[0] || 'Equipe'; })();

  let registros = [];
  let crm = [];
  const abertas = new Set();          // semanas abertas
  const partesFechadas = new Set();   // 'AAAA-MM-DD_retro' etc.
  const pendentes = {};               // docId → timer de salvamento
  const base = {};                    // docId → { updated_at, html } da última versão vista do servidor

  // ---------- datas ----------
  const segunda = iso => { const d = dates.toDate(iso); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dates.toISO(d); };
  const ddmm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—';
  const tituloSprint = s => `Sprint da Semana (${ddmm(s.inicio)} - ${ddmm(s.fim)})`;
  const local = iso => iso ? dates.toISO(new Date(iso)) : null;
  const sprints = () => registros.filter(r => r.tipo === 'sprint').sort((a, b) => b.inicio.localeCompare(a.inicio));
  const docId = (s, parte) => `doc_${s.inicio}_${parte}`;
  const docDe = (s, parte) => registros.find(r => r.id === docId(s, parte));

  // ---------- limpeza do HTML (colado do ClickUp, Word, Google Docs…) ----------
  const PERMITIDAS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4',
    'BLOCKQUOTE', 'HR', 'A', 'DIV', 'SPAN', 'CODE', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
  const REMOVER = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON',
    'TEXTAREA', 'SELECT', 'IMG', 'VIDEO', 'AUDIO', 'NOSCRIPT', 'TEMPLATE']);
  function sanitizar(html) {
    const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
    const limpar = el => {
      [...el.children].forEach(c => {
        if (REMOVER.has(c.tagName)) return c.remove();
        limpar(c);
        if (!PERMITIDAS.has(c.tagName)) { c.replaceWith(...c.childNodes); return; }
        [...c.attributes].forEach(a => {
          const n = a.name.toLowerCase();
          const ok = (c.tagName === 'A' && n === 'href' && /^(https?:|mailto:)/i.test(a.value.trim()))
            || (c.tagName === 'UL' && n === 'class' && a.value === 'check')
            || (c.tagName === 'LI' && n === 'data-done' && /^(true|false)$/.test(a.value))
            || (['TD', 'TH'].includes(c.tagName) && ['colspan', 'rowspan'].includes(n) && /^\d+$/.test(a.value));
          if (!ok) c.removeAttribute(a.name);
        });
        if (c.tagName === 'A') { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
      });
    };
    limpar(doc.body);
    return doc.body.innerHTML;
  }
  const temTexto = html => !!(html && sanitizar(html).replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, ''));

  // conteúdo do formato anterior (KRs e campos da retrospectiva) aparece como texto do documento
  function legado(s, parte) {
    if (parte === 'retro') {
      const r = s.retro || {};
      return [['O que funcionou', r.positivos], ['O que pode melhorar', r.melhorar], ['Ações para esta semana', r.acoes]]
        .filter(([, v]) => v).map(([t, v]) => `<h3>${esc(t)}</h3><p>${esc(v).replace(/\n/g, '<br>')}</p>`).join('');
    }
    const krs = registros.filter(r => r.tipo === 'kr' && r.sprint === s.id);
    return krs.map(k => `<p><b>KR's - ${esc(k.area || '—')} | ${esc(k.titulo || '—')}</b></p><ul>
      <li>Prioridade: ${esc(k.prioridade ?? '—')}</li><li>Esforço: ${esc(k.esforco ?? '—')}</li><li>Responsável: ${esc(k.responsavel || '—')}</li><li>Prazo: ${esc(ddmm(k.prazo))}</li></ul>
      ${(k.tarefas || []).length ? `<ul class="check">${k.tarefas.map(t => `<li data-done="${!!t.feito}">${esc(t.texto || '')}${t.data ? ` (${ddmm(t.data)})` : ''}</li>`).join('')}</ul>` : ''}`).join('<hr>');
  }
  const htmlDe = (s, parte) => { const d = docDe(s, parte); return d ? d.html : legado(s, parte); };

  // ---------- coleta de dados a partir do CRM ----------
  const LINHAS = () => [
    { grupo: 'Atividades Comerciais' },
    { k: 'leads_pa', label: 'Número de Leads Contatados (PA)', ajuda: 'Negociações criadas na semana com fonte "Prospecção ativa"' },
    { k: 'leads_passivos', label: 'Número de Leads (Passivos)', ajuda: 'Negociações criadas na semana com outras fontes (formulário, indicação, Instagram…)' },
    { k: 'ligacoes', label: 'Número de Ligações realizadas', ajuda: 'Tarefas "Ligação" concluídas na semana' },
    { k: 'cold_realizadas', label: 'Cold Calls Realizadas', ajuda: 'Tarefas "Cold call" concluídas na semana' },
    { k: 'cold_atendidas', label: 'Cold Calls Atendidas', ajuda: 'Cold calls concluídas na semana com resultado "Atendida"' },
    { k: 'porta_a_porta', label: 'Visitas Porta a Porta', ajuda: 'Tarefas "Porta a porta" concluídas na semana' },
    { k: 'visitas_reunioes', label: 'Número de Visitas / Reuniões', ajuda: 'Tarefas "Visita" e "Reunião" concluídas na semana' },
    { k: 'contratos', label: 'Número de Contratos Fechados', ajuda: 'Negociações que entraram em "Negócio fechado" na semana' },
    ...HUBS.map(h => ({ k: 'hub_' + norm(h), label: `Valor fechado — Hub ${h} (Novos contratos/Upsell/Reajuste)`, moeda: true,
      ajuda: `Soma do valor das negociações fechadas na semana com HUB ${h}` })),
    { grupo: 'Informações do MKT* (MQL)' },
    { k: 'mql_novos', label: 'Número de novos leads', ajuda: 'Leads passivos criados na semana' },
    ...['Q1', 'Q3', 'Q5'].map(q => ({ k: 'mql_' + q.toLowerCase(), label: q, ajuda: `Novos leads com Qualificação MKT (MQL) = ${q}` })),
    { grupo: 'Informações do MKT* (SQL)' },
    { k: 'sql_novos', label: 'Número de novos leads', ajuda: 'Leads passivos criados na semana' },
    ...['Q1', 'Q3', 'Q5'].map(q => ({ k: 'sql_' + q.toLowerCase(), label: q, ajuda: `Novos leads com Qualificação (SQL) = ${q}` })),
  ];

  function calcularDados(s) {
    const naSemana = iso => { const d = local(iso); return !!d && d >= s.inicio && d <= s.fim; };
    const isPA = d => norm(d.fonte).includes('prospec');
    const tarefas = crm.flatMap(d => (d.tarefas || []).filter(t => t.concluida && naSemana(t.concluida_em)));
    const tipo = (...ts) => tarefas.filter(t => ts.includes(t.tipo));
    const novos = crm.filter(d => naSemana(d.criado_em));
    const passivos = novos.filter(d => !isPA(d));
    const fechados = crm.filter(d => (d.historico || []).some(h => h.etapa === 'Negócio fechado' && naSemana(h.em)));
    const out = {
      leads_pa: novos.filter(isPA).length, leads_passivos: passivos.length,
      ligacoes: tipo('Ligação').length, cold_realizadas: tipo('Cold call').length,
      cold_atendidas: tipo('Cold call').filter(t => t.resultado === 'Atendida').length,
      porta_a_porta: tipo('Porta a porta').length, visitas_reunioes: tipo('Visita', 'Reunião').length,
      contratos: fechados.length, mql_novos: passivos.length, sql_novos: passivos.length, leads_hub: {},
    };
    HUBS.forEach(h => {
      const ds = fechados.filter(d => norm(d.empresa?.hub) === norm(h));
      out['hub_' + norm(h)] = ds.reduce((a, d) => a + (Number(d.valor_total) || 0), 0);
      out.leads_hub['hub_' + norm(h)] = ds.map(d => d.titulo || 'Sem nome');
    });
    ['Q1', 'Q3', 'Q5'].forEach(q => {
      out['mql_' + q.toLowerCase()] = passivos.filter(d => d.qualificacao_mkt === q).length;
      out['sql_' + q.toLowerCase()] = passivos.filter(d => d.qualificacao === q).length;
    });
    return out;
  }

  async function salvarSemana(s) {
    const salvo = await Store.save(TABELA, s);
    s.updated_at = salvo.updated_at;
  }

  // quem lê o CRM guarda uma cópia dos números na semana, para todas as áreas verem os mesmos valores
  async function sincronizarDados(s) {
    if (!lerCRM) return;
    const auto = calcularDados(s);
    if (JSON.stringify(auto) === JSON.stringify(s.dados?.auto)) return;
    s.dados = { ...(s.dados || {}), auto, atualizado_em: new Date().toISOString() };
    if (canEdit) { try { await salvarSemana(s); } catch (e) { toast(e.message, 'error'); } }
  }

  function coletaHTML(s) {
    const auto = s.dados?.auto || {}, manual = s.dados?.manual || {};
    const dis = canEdit ? '' : 'disabled';
    return `<tbody>${LINHAS().map(l => {
      if (l.grupo) return `<tr class="grupo"><th colspan="2">${esc(l.grupo)}</th></tr>`;
      const m = manual[l.k], a = auto[l.k];
      const usaAuto = isBlank(m);
      const leads = l.moeda && auto.leads_hub?.[l.k]?.length ? `<small class="muted coleta-leads">${auto.leads_hub[l.k].map(esc).join(', ')}</small>` : '';
      return `<tr><td title="${esc(l.ajuda || '')}">${esc(l.label)}${leads}</td>
        <td class="num coleta-val ${usaAuto && !isBlank(a) ? 'auto' : ''}"><div class="cv">
          ${usaAuto && !isBlank(a) ? '<span class="auto-dot" title="Calculado pela plataforma"></span>' : ''}
          <input class="v num" data-m="${l.k}" type="number" step="any" value="${isBlank(m) ? '' : m}"
            placeholder="${isBlank(a) ? '—' : (l.moeda ? fmt.money(a) : a)}" ${dis}></div></td></tr>`;
    }).join('')}</tbody>`;
  }

  // ---------- editor de documento ----------
  const FERRAMENTAS = [
    ['bold', '<b>N</b>', 'Negrito (⌘B)'], ['italic', '<i>I</i>', 'Itálico (⌘I)'], ['underline', '<u>S</u>', 'Sublinhado (⌘U)'], ['strikeThrough', '<s>T</s>', 'Riscado'],
    ['|'], ['h2', 'T1', 'Título'], ['h3', 'T2', 'Subtítulo'], ['p', '¶', 'Texto normal'],
    ['|'], ['insertUnorderedList', '•', 'Lista'], ['insertOrderedList', '1.', 'Lista numerada'], ['checklist', '<svg viewBox="0 0 24 24" class="ico"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>', 'Checklist'],
    ['|'], ['insertHorizontalRule', '—', 'Linha separadora'], ['link', '<svg viewBox="0 0 24 24" class="ico"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>', 'Link'], ['removeFormat', '<svg viewBox="0 0 24 24" class="ico"><path d="M5 6h11M10.5 6 7 18"/><path d="m15 14 5 5m0-5-5 5"/></svg>', 'Limpar formatação'],
  ];
  function editorHTML(s, parte) {
    const id = docId(s, parte);
    const d = docDe(s, parte);
    const ph = parte === 'sprint' ? 'Escreva ou cole aqui a sprint da semana (KRs, responsáveis, prazos, tarefas…)'
      : 'Escreva ou cole aqui a retrospectiva da semana (o que funcionou, o que melhorar, ações…)';
    return `<div class="doc" data-doc="${esc(id)}">
      ${canEdit ? `<div class="editor-bar" role="toolbar" aria-label="Formatação">${FERRAMENTAS.map(([c, ic, t]) => c === '|' ? '<span class="sep"></span>'
        : `<button type="button" data-cmd="${c}" title="${t}" aria-label="${t}">${ic}</button>`).join('')}</div>` : ''}
      <div class="editor" ${canEdit ? 'contenteditable="true"' : ''} data-placeholder="${esc(canEdit ? ph : 'Nada escrito ainda.')}" spellcheck="true"></div>
      <div class="doc-meta muted small">${d?.editado_por ? `Última edição por ${esc(d.editado_por)} · ${esc(fmt.dateTime(d.updated_at))}` : ''}</div>
    </div>`;
  }

  function ligarEditor(box, s, parte) {
    const id = docId(s, parte);
    const ed = $('.editor', box);
    ed.innerHTML = sanitizar(htmlDe(s, parte));
    if (!base[id]) base[id] = { updated_at: docDe(s, parte)?.updated_at || null, html: docDe(s, parte)?.html || '' };
    // checklist: clicar na caixinha marca/desmarca
    ed.addEventListener('click', e => {
      const li = e.target.closest('ul.check > li');
      if (!li || !canEdit) return;
      if (e.clientX - li.getBoundingClientRect().left > 26) return;
      li.dataset.done = li.dataset.done === 'true' ? 'false' : 'true';
      agendar(s, parte, ed);
    });
    if (!canEdit) return;
    ed.addEventListener('input', () => agendar(s, parte, ed));
    ed.addEventListener('paste', e => {
      const html = e.clipboardData.getData('text/html');
      const txt = e.clipboardData.getData('text/plain');
      e.preventDefault();
      document.execCommand('insertHTML', false, html ? sanitizar(html) : esc(txt).replace(/\n/g, '<br>'));
    });
    $$('[data-cmd]', box).forEach(b => b.addEventListener('mousedown', e => {
      e.preventDefault(); // mantém a seleção no texto
      const c = b.dataset.cmd;
      ed.focus();
      const ulDaSelecao = () => { const n = window.getSelection().anchorNode; return (n?.nodeType === 1 ? n : n?.parentElement)?.closest('ul'); };
      if (c === 'h2' || c === 'h3' || c === 'p') document.execCommand('formatBlock', false, c);
      else if (c === 'checklist') {
        let ul = ulDaSelecao();
        if (!ul || !ed.contains(ul)) { document.execCommand('insertUnorderedList'); ul = ulDaSelecao(); }
        if (ul && ed.contains(ul)) {
          if (ul.classList.contains('check')) { ul.removeAttribute('class'); $$('li', ul).forEach(li => li.removeAttribute('data-done')); }
          else { ul.className = 'check'; $$(':scope > li', ul).forEach(li => { li.dataset.done = li.dataset.done || 'false'; }); }
        }
      } else if (c === 'link') {
        const url = prompt('Endereço do link (https://…):', 'https://');
        if (url && /^(https?:\/\/|mailto:)/i.test(url.trim())) document.execCommand('createLink', false, url.trim());
      } else document.execCommand(c);
      agendar(s, parte, ed);
    }));
  }

  function agendar(s, parte, ed) {
    const id = docId(s, parte);
    estado('Salvando…');
    clearTimeout(pendentes[id]);
    pendentes[id] = setTimeout(() => salvarDoc(s, parte, ed), 1200);
  }

  async function salvarDoc(s, parte, ed) {
    const id = docId(s, parte);
    const html = sanitizar(ed.innerHTML);
    try {
      // alguém salvou este documento enquanto você escrevia?
      const atual = await Store.get(TABELA, id);
      if (atual && atual.updated_at !== base[id]?.updated_at && atual.html !== base[id]?.html && atual.html !== html) {
        const manter = await conflito(atual);
        if (!manter) {
          registros = [...registros.filter(r => r.id !== id), atual];
          base[id] = { updated_at: atual.updated_at, html: atual.html };
          delete pendentes[id];
          ed.innerHTML = sanitizar(atual.html);
          estado('Texto atualizado com a versão mais recente');
          return;
        }
      }
      const salvo = await Store.save(TABELA, { id, tipo: 'doc', sprint: s.id, parte, html, editado_por: eu });
      registros = [...registros.filter(r => r.id !== id), salvo];
      base[id] = { updated_at: salvo.updated_at, html };
      delete pendentes[id];
      const meta = ed.closest('.doc')?.querySelector('.doc-meta');
      if (meta) meta.textContent = `Última edição por ${eu} · ${fmt.dateTime(salvo.updated_at)}`;
      atualizarSelos(s);
      if (!Object.keys(pendentes).length) estado('Salvo');
    } catch (e) { estado('Erro ao salvar'); toast(e.message, 'error'); }
  }

  function conflito(atual) {
    return new Promise(resolve => {
      let manter = false;
      const dlg = openModal({
        title: 'Outra pessoa editou este documento',
        body: `<p><b>${esc(atual.editado_por || 'Alguém')}</b> salvou uma versão às ${esc(fmt.dateTime(atual.updated_at))}, enquanto você escrevia.</p>
          <p class="muted small">Se mantiver o seu texto, a versão da outra pessoa será substituída. Se preferir, copie o seu texto antes de carregar a versão dela.</p>`,
        actions: [
          { label: 'Carregar a versão dela', cls: 'ghost' },
          { label: 'Manter o meu texto', cls: 'primary', onClick: () => { manter = true; } },
        ],
      });
      dlg.addEventListener('close', () => resolve(manter));
    });
  }
  const estado = t => { const el = $('#estado'); if (el) el.textContent = t; };

  // ---------- lista de semanas ----------
  function selos(s) {
    const sp = temTexto(htmlDe(s, 'sprint')), rt = temTexto(htmlDe(s, 'retro'));
    return `<span class="selo ${sp ? 'ok' : ''}">Sprint</span><span class="selo ${rt ? 'ok' : ''}">Retrospectiva</span>`;
  }
  function atualizarSelos(s) { const el = $(`.semana[data-id="${s.id}"] .selos`); if (el) el.innerHTML = selos(s); }

  // ---------- evolução semanal (tabela + gráfico com a coleta das últimas 8 semanas) ----------
  function renderEvolucao(lista) {
    const box = $('#evolucao');
    if (!box) return;
    const semanas = lista.filter(s => s.dados?.auto || s.dados?.manual).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(-8);
    if (!semanas.length) { box.hidden = true; return; }
    box.hidden = false;
    const val = (s, k) => { const m = s.dados?.manual?.[k], a = s.dados?.auto?.[k]; return !isBlank(m) ? Number(m) : isBlank(a) ? null : Number(a); };
    const hubs = HUBS.map(h => 'hub_' + norm(h));
    const valorFechado = s => { const v = hubs.map(k => val(s, k)).filter(x => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    const METRICAS = [
      ['Leads contatados (PA)', s => val(s, 'leads_pa')],
      ['Leads passivos', s => val(s, 'leads_passivos')],
      ['Ligações', s => val(s, 'ligacoes')],
      ['Cold calls realizadas', s => val(s, 'cold_realizadas')],
      ['Cold calls atendidas', s => val(s, 'cold_atendidas')],
      ['Porta a porta', s => val(s, 'porta_a_porta')],
      ['Visitas / reuniões', s => val(s, 'visitas_reunioes')],
      ['Contratos fechados', s => val(s, 'contratos')],
      ['Valor fechado', valorFechado, true],
    ];
    const rot = s => ddmm(s.inicio);
    box.innerHTML = `<div class="evo-head"><h2>Evolução semanal</h2><span class="muted small">Coleta de dados das últimas ${semanas.length} semanas</span></div>
      <div class="chart-box"><canvas id="c-evolucao"></canvas></div>
      <div class="table-wrap"><table class="data static evo-tab"><thead><tr><th>Indicador</th>${semanas.map(s => `<th class="num">${rot(s)}</th>`).join('')}</tr></thead>
      <tbody>${METRICAS.map(([n, f, din]) => `<tr><td>${esc(n)}</td>${semanas.map(s => { const v = f(s); return `<td class="num">${v === null ? '<span class="muted">—</span>' : din ? fmt.money(v) : fmt.num(v, 0)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
    if (typeof Dash !== 'undefined') Dash.bar('c-evolucao', { labels: semanas.map(rot), datasets: [
      { label: 'Leads contatados (PA)', color: Dash.css('--series-1'), data: semanas.map(s => val(s, 'leads_pa') ?? 0) },
      { label: 'Leads passivos', color: Dash.css('--series-2'), data: semanas.map(s => val(s, 'leads_passivos') ?? 0) },
      { label: 'Visitas / reuniões', color: Dash.css('--series-3'), data: semanas.map(s => val(s, 'visitas_reunioes') ?? 0) },
      { label: 'Contratos fechados', color: Dash.css('--series-4'), data: semanas.map(s => val(s, 'contratos') ?? 0) },
    ] });
  }

  function render() {
    const lista = sprints();
    renderEvolucao(lista);
    const hoje = dates.today();
    const prox = proximoInicio();
    const btn = $('#nova-sprint');
    if (btn?.tagName === 'BUTTON') btn.textContent = `+ Adicionar sprint da semana seguinte (${ddmm(prox)} - ${ddmm(dates.addDays(prox, 4))})`;
    if (!lista.length) {
      $('#semanas').innerHTML = `<div class="card empty-state"><h2>Nenhuma sprint ainda</h2>
        <p class="muted">${canEdit ? 'Use o botão acima para criar a primeira sprint.' : 'Assim que a equipe criar a primeira sprint, ela aparece aqui.'}</p></div>`;
      return;
    }
    $('#semanas').innerHTML = lista.map(s => {
      const atual = s.inicio <= hoje && s.fim >= hoje;
      return `<details class="semana card" data-id="${esc(s.id)}" ${abertas.has(s.id) ? 'open' : ''}>
        <summary>
          <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
          <span class="semana-titulo">${esc(tituloSprint(s))}</span>
          ${atual ? '<span class="badge ok">Semana atual</span>' : s.inicio > hoje ? '<span class="badge neutral">Próxima</span>' : ''}
          <span class="selos">${selos(s)}</span>
          ${Store.isAdmin() ? '<button type="button" class="icon-btn small excluir-semana" title="Excluir esta semana" aria-label="Excluir esta semana">×</button>' : ''}
        </summary>
        <div class="semana-corpo"></div>
      </details>`;
    }).join('');
    $$('.semana').forEach(el => {
      const s = registros.find(r => r.id === el.dataset.id);
      if (el.open) corpo(el, s);
      el.addEventListener('toggle', () => {
        if (el.open) { abertas.add(s.id); if (!$('.parte', el)) corpo(el, s); } else abertas.delete(s.id);
      });
      $('.excluir-semana', el)?.addEventListener('click', e => { e.preventDefault(); excluirSemana(s); });
    });
  }

  function corpo(el, s) {
    sincronizarDados(s);
    const parte = (p, titulo, extra = '') => `<details class="parte" data-parte="${p}" ${partesFechadas.has(`${s.inicio}_${p}`) ? '' : 'open'}>
      <summary><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>${titulo}</summary>
      <div class="parte-corpo">${editorHTML(s, p)}${extra}</div></details>`;
    $('.semana-corpo', el).innerHTML =
      parte('sprint', 'Sprint', `
        <div class="coleta">
          <div class="coleta-head"><h3 class="sec-titulo">Coleta de dados</h3>
            <span class="muted small">${s.dados?.atualizado_em ? `Preenchido pela plataforma (CRM) de ${ddmm(s.inicio)} a ${ddmm(s.fim)} · atualizado ${esc(fmt.dateTime(s.dados.atualizado_em))}` : 'Ainda sem números calculados'}
            ${lerCRM ? '' : ' · os números são atualizados quando alguém do Comercial abre esta semana'}</span></div>
          <div class="table-wrap"><table class="data static">${coletaHTML(s)}</table></div>
          <p class="muted small coleta-nota"><span class="auto-dot"></span> preenchido automaticamente · digite um valor para corrigir (apague para voltar ao automático)</p>
        </div>`)
      + parte('retro', 'Retrospectiva');
    ['sprint', 'retro'].forEach(p => ligarEditor($(`.parte[data-parte="${p}"]`, el), s, p));
    $$('.parte', el).forEach(pe => pe.addEventListener('toggle', () => {
      const k = `${s.inicio}_${pe.dataset.parte}`;
      if (pe.open) partesFechadas.delete(k); else partesFechadas.add(k);
    }));
    $$('[data-m]', el).forEach(i => i.addEventListener('change', async () => {
      const manual = { ...(s.dados?.manual || {}) };
      const v = parse.num(i.value);
      if (v === null) delete manual[i.dataset.m]; else manual[i.dataset.m] = v;
      s.dados = { ...(s.dados || {}), manual };
      try { await salvarSemana(s); estado('Salvo'); } catch (e) { toast(e.message, 'error'); }
      const td = i.closest('td');
      const auto = s.dados?.auto?.[i.dataset.m];
      td.classList.toggle('auto', v === null && !isBlank(auto));
      const dot = $('.auto-dot', td);
      if (v === null && !isBlank(auto) && !dot) $('.cv', td).insertAdjacentHTML('afterbegin', '<span class="auto-dot" title="Calculado pela plataforma"></span>');
      if (v !== null) dot?.remove();
    }));
  }

  // ---------- criar / excluir ----------
  // semana seguinte à última sprint; se a equipe pulou semanas, começa na semana atual
  function proximoInicio() {
    const ultima = sprints()[0];
    const atual = segunda(dates.today());
    const candidata = ultima ? dates.addDays(ultima.inicio, 7) : atual;
    return candidata < atual ? atual : candidata;
  }

  async function novaSprint() {
    const inicio = proximoInicio();
    const s = { id: 's_' + inicio, tipo: 'sprint', inicio, fim: dates.addDays(inicio, 4), dados: {}, criado_em: new Date().toISOString(), criado_por: eu };
    try {
      await salvarSemana(s);
      registros.push(s);
      abertas.clear();
      abertas.add(s.id);
      render();
      toast(`${tituloSprint(s)} criada`, 'ok');
      $(`.semana[data-id="${s.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { toast(e.message, 'error'); }
  }

  async function excluirSemana(s) {
    if (!confirm(`Excluir a ${tituloSprint(s)} com a sprint, a retrospectiva e a coleta de dados? Isso não pode ser desfeito.`)) return;
    try {
      const ids = registros.filter(r => r.id === s.id || r.sprint === s.id).map(r => r.id);
      for (const id of ids) await Store.remove(TABELA, id);
      registros = registros.filter(r => !ids.includes(r.id));
      render();
      toast('Semana excluída');
    } catch (e) { toast(e.message, 'error'); }
  }

  // ---------- carregar ----------
  async function carregar(primeira = false) {
    try {
      const [regs, deals] = await Promise.all([Store.list(TABELA), lerCRM ? Store.list('crm').catch(() => []) : []]);
      crm = deals;
      if (primeira) {
        registros = regs;
        const hoje = dates.today();
        const lista = sprints();
        const atual = lista.find(s => s.inicio <= hoje && s.fim >= hoje) || lista[0];
        if (atual) abertas.add(atual.id);
        render();
        return;
      }
      // atualização periódica: não mexe no documento que está sendo editado aqui
      const focado = document.activeElement?.closest?.('.doc')?.dataset.doc;
      const emEdicao = id => id === focado || !!pendentes[id];
      const mudou = regs.filter(r => { const a = registros.find(x => x.id === r.id); return !a || a.updated_at !== r.updated_at; });
      const sumiu = registros.some(r => !regs.some(x => x.id === r.id) && !emEdicao(r.id));
      registros = [...regs.filter(r => !emEdicao(r.id)), ...registros.filter(r => emEdicao(r.id))];
      if (sumiu || mudou.some(r => r.tipo === 'sprint')) {
        if (!focado && !Object.keys(pendentes).length) render();
        return;
      }
      mudou.filter(r => r.tipo === 'doc' && !emEdicao(r.id)).forEach(r => {
        const ed = $(`.doc[data-doc="${r.id}"] .editor`);
        if (ed) {
          ed.innerHTML = sanitizar(r.html);
          base[r.id] = { updated_at: r.updated_at, html: r.html };
          const meta = ed.closest('.doc').querySelector('.doc-meta');
          if (meta) meta.textContent = `Última edição por ${r.editado_por || '—'} · ${fmt.dateTime(r.updated_at)}`;
        }
        const s = registros.find(x => x.id === r.sprint);
        if (s) atualizarSelos(s);
      });
    } catch (e) { toast('Erro ao carregar as sprints: ' + e.message, 'error'); }
  }

  if (canEdit) $('#nova-sprint').addEventListener('click', novaSprint);
  else $('#nova-sprint').replaceWith(Object.assign(document.createElement('span'), { className: 'badge neutral', textContent: 'Somente visualização' }));
  // edições de outras pessoas aparecem sozinhas
  setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]')) carregar(); }, 30000);
  window.addEventListener('beforeunload', e => { if (Object.keys(pendentes).length) { e.preventDefault(); e.returnValue = ''; } });
  carregar(true);
})();
