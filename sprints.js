// Sprints semanais (tabela 'sprints', aberta a toda a equipe; Espectadores só leem).
//   's_AAAA-MM-DD'  → sprint: { tipo: 'sprint', inicio, fim, retro: { positivos, melhorar, acoes }, dados: { auto, manual, atualizado_em } }
//   'kr_<id>'       → KR:     { tipo: 'kr', sprint, area, titulo, prioridade, esforco, responsavel, prazo, concluido, tarefas: [{ id, texto, data, feito }] }
// Cada KR é um registro separado: duas pessoas editando KRs diferentes ao mesmo tempo não se sobrescrevem.
// O quadro "Coleta de dados" é calculado a partir do CRM (negociações e tarefas da semana). Quem pode ler o CRM
// guarda uma cópia dos números na sprint, para que todas as áreas vejam os mesmos valores.
(() => {
  if (window.SEM_ACESSO) return;

  const TABELA = 'sprints';
  const FIB = [1, 2, 3, 5, 8, 13, 21];
  const AREAS_KR = ['Comercial', 'Atendimento', 'CS', 'MKT', 'Operações', 'Financeiro'];
  const canEdit = Store.podeEditar(TABELA);
  const lerCRM = Store.podeLer('crm');
  const eu = (() => { const p = Store.perfil(); return p.nome || (Store.getSession()?.email || '').split('@')[0] || 'Equipe'; })();

  let registros = [];
  let atualId = null;
  let crm = [];
  const timers = {};
  let digitando = false;

  // ---------- datas ----------
  const segunda = iso => { const d = dates.toDate(iso); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dates.toISO(d); };
  const ddmm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—';
  const tituloSprint = s => `Sprint da Semana (${ddmm(s.inicio)} - ${ddmm(s.fim)})`;
  const local = iso => iso ? dates.toISO(new Date(iso)) : null;

  const sprints = () => registros.filter(r => r.tipo === 'sprint').sort((a, b) => b.inicio.localeCompare(a.inicio));
  const krsDe = id => registros.filter(r => r.tipo === 'kr' && r.sprint === id)
    .sort((a, b) => (a.area || '').localeCompare(b.area || '', 'pt-BR') || (Number(a.prioridade) || 99) - (Number(b.prioridade) || 99) || (a.criado_em || '').localeCompare(b.criado_em || ''));
  const anterior = s => sprints().find(x => x.inicio < s.inicio) || null;
  const pontos = krs => ({ feitos: krs.filter(k => k.concluido).reduce((a, k) => a + (Number(k.esforco) || 0), 0), total: krs.reduce((a, k) => a + (Number(k.esforco) || 0), 0) });

  // ---------- salvar (com atraso, por registro) ----------
  function salvar(rec, imediato = false) {
    rec.atualizado_por = eu;
    clearTimeout(timers[rec.id]);
    estado('Salvando…');
    const go = async () => {
      delete timers[rec.id];
      try { await Store.save(TABELA, rec); if (!Object.keys(timers).length) estado('Salvo'); }
      catch (e) { estado('Erro ao salvar'); toast(e.message, 'error'); }
    };
    if (imediato) return go();
    timers[rec.id] = setTimeout(go, 600);
  }
  const estado = t => { const el = $('#estado'); if (el) el.textContent = t; };

  // ---------- coleta de dados a partir do CRM ----------
  const LINHAS = () => [
    { grupo: 'Atividades Comerciais' },
    { k: 'leads_pa', label: '👥 Número de Leads Contatados (PA)', ajuda: 'Negociações criadas na semana com fonte "Prospecção ativa"' },
    { k: 'leads_passivos', label: '👤 Número de Leads (Passivos)', ajuda: 'Negociações criadas na semana com outras fontes (formulário, indicação, Instagram…)' },
    { k: 'ligacoes', label: '☎️ Número de Ligações realizadas', ajuda: 'Tarefas "Ligação" concluídas na semana' },
    { k: 'cold_realizadas', label: '🥶 Cold Calls Realizadas', ajuda: 'Tarefas "Cold call" concluídas na semana' },
    { k: 'cold_atendidas', label: '📞 Cold Calls Atendidas', ajuda: 'Cold calls concluídas na semana com resultado "Atendida"' },
    { k: 'porta_a_porta', label: '🚪 Visitas Porta a Porta', ajuda: 'Tarefas "Porta a porta" concluídas na semana' },
    { k: 'visitas_reunioes', label: '🏢 Número de Visitas / Reuniões', ajuda: 'Tarefas "Visita" e "Reunião" concluídas na semana' },
    { k: 'contratos', label: '📑 Número de Contratos Fechados', ajuda: 'Negociações que entraram em "Negócio fechado" na semana' },
    ...HUBS.map(h => ({ k: 'hub_' + norm(h), label: `💲 Valor fechado — Hub ${h} (Novos contratos/Upsell/Reajuste)`, moeda: true,
      ajuda: `Soma do valor das negociações fechadas na semana com HUB ${h}` })),
    { grupo: 'Informações do MKT* (MQL)' },
    { k: 'mql_novos', label: '🐳 Número de novos leads', ajuda: 'Leads passivos criados na semana' },
    ...['Q1', 'Q3', 'Q5'].map(q => ({ k: 'mql_' + q.toLowerCase(), label: q, ajuda: `Novos leads com Qualificação MKT (MQL) = ${q}` })),
    { grupo: 'Informações do MKT* (SQL)' },
    { k: 'sql_novos', label: '🐳 Número de novos leads', ajuda: 'Leads passivos criados na semana' },
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
      leads_pa: novos.filter(isPA).length,
      leads_passivos: passivos.length,
      ligacoes: tipo('Ligação').length,
      cold_realizadas: tipo('Cold call').length,
      cold_atendidas: tipo('Cold call').filter(t => t.resultado === 'Atendida').length,
      porta_a_porta: tipo('Porta a porta').length,
      visitas_reunioes: tipo('Visita', 'Reunião').length,
      contratos: fechados.length,
      mql_novos: passivos.length,
      sql_novos: passivos.length,
      leads_hub: {},
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

  // quem lê o CRM atualiza a cópia dos números guardada na sprint
  function sincronizarDados(s) {
    if (!lerCRM) return;
    const auto = calcularDados(s);
    if (JSON.stringify(auto) === JSON.stringify(s.dados?.auto)) return;
    s.dados = { ...(s.dados || {}), auto, atualizado_em: new Date().toISOString() };
    if (canEdit) salvar(s);
  }

  // ---------- telas ----------
  function render() {
    const lista = sprints();
    const sel = $('#sel-sprint');
    sel.innerHTML = lista.map(s => `<option value="${esc(s.id)}" ${s.id === atualId ? 'selected' : ''}>${esc(tituloSprint(s))}</option>`).join('')
      || '<option value="">Nenhuma sprint ainda</option>';
    const s = lista.find(x => x.id === atualId);
    const i = lista.indexOf(s);
    $('#ant').disabled = !s || i === lista.length - 1;
    $('#prox').disabled = !s || i <= 0;
    if (!s) {
      $('#sprint').innerHTML = `<div class="card empty-state"><h2>Nenhuma sprint criada</h2>
        <p class="muted">Crie a sprint desta semana para registrar os KRs, as tarefas, a retrospectiva e a coleta de dados.</p>
        ${canEdit ? '<button class="btn primary" id="criar-vazio">+ Criar sprint desta semana</button>' : ''}</div>`;
      $('#criar-vazio')?.addEventListener('click', novaSprint);
      return;
    }
    sincronizarDados(s);
    const krs = krsDe(s.id);
    const p = pontos(krs);
    const ant = anterior(s);
    const dis = canEdit ? '' : 'disabled';
    $('#sprint').innerHTML = `
      <section class="card sprint-head">
        <div class="sprint-titulo">
          <h2>${esc(tituloSprint(s))}</h2>
          <div class="sprint-datas">
            <label>Início <input class="input" type="date" data-s="inicio" value="${esc(s.inicio)}" ${dis}></label>
            <label>Fim <input class="input" type="date" data-s="fim" value="${esc(s.fim)}" ${dis}></label>
          </div>
        </div>
        <div class="sprint-chips">
          <span class="chip-info big">💪 ${p.feitos}/${p.total} <small>pontos entregues</small></span>
          <span class="chip-info">🦾 ${krs.filter(k => k.concluido).length}/${krs.length} KRs concluídos</span>
          <span class="chip-info fib" title="Escala de esforço (Fibonacci)">${FIB.join(', ')}</span>
          <span class="spacer"></span>
          <button class="btn ghost small" id="copiar">Copiar texto</button>
          ${Store.isAdmin() ? '<button class="btn ghost small danger" id="excluir-sprint">Excluir sprint</button>' : ''}
        </div>
      </section>

      <section class="card">
        <h3 class="sec-titulo">🔁 Retrospectiva da semana anterior</h3>
        ${ant ? retroAnterior(ant) : '<p class="muted small">Não há sprint anterior para comparar.</p>'}
        <div class="retro-grid">
          ${[['positivos', '✅ O que funcionou'], ['melhorar', '⚠️ O que pode melhorar'], ['acoes', '🎯 Ações para esta semana']].map(([k, l]) => `
            <label class="field"><span>${l}</span><textarea class="input" rows="4" data-retro="${k}" ${dis}
              placeholder="${canEdit ? 'Escreva aqui…' : ''}">${esc(s.retro?.[k] || '')}</textarea></label>`).join('')}
        </div>
      </section>

      <section class="krs">
        <div class="krs-head"><h3 class="sec-titulo">🦾 KRs e tarefas da semana</h3>
          ${canEdit ? '<button class="btn primary small" id="novo-kr">+ Novo KR</button>' : ''}</div>
        ${krs.length ? krs.map(krHTML).join('') : '<div class="card muted small">Nenhum KR nesta sprint ainda.</div>'}
        ${krs.length ? `<div class="krs-total">💪 - ${p.feitos}/${p.total}</div>` : ''}
        <datalist id="dl-areas">${[...new Set([...AREAS_KR, ...registros.filter(r => r.tipo === 'kr').map(r => r.area).filter(Boolean)])].map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        <datalist id="dl-resp">${[...new Set(registros.filter(r => r.tipo === 'kr').map(r => r.responsavel).filter(Boolean))].map(a => `<option value="${esc(a)}">`).join('')}</datalist>
      </section>

      <section class="card table-card coleta">
        <div class="coleta-head"><h3 class="sec-titulo">📊 Coleta de dados</h3>
          <span class="muted small">${s.dados?.atualizado_em ? `Calculado do CRM de ${ddmm(s.inicio)} a ${ddmm(s.fim)} · atualizado ${esc(fmt.dateTime(s.dados.atualizado_em))}` : 'Ainda sem números do CRM'}
          ${lerCRM ? '' : ' · os números são atualizados quando alguém do Comercial abre esta sprint'}</span></div>
        <div class="table-wrap"><table class="data static">${coletaHTML(s)}</table></div>
        <p class="muted small coleta-nota"><span class="auto-dot"></span> calculado pela plataforma · digite um valor para corrigir (apague para voltar ao calculado)</p>
      </section>`;
    bind(s);
  }

  function retroAnterior(ant) {
    const krs = krsDe(ant.id), p = pontos(krs);
    return `<div class="retro-ant">
      <div class="retro-ant-head"><b>${esc(tituloSprint(ant))}</b><span>💪 ${p.feitos}/${p.total} pontos</span>
        <span>🦾 ${krs.filter(k => k.concluido).length}/${krs.length} KRs</span>
        <button class="link-btn" data-ir="${esc(ant.id)}">abrir</button></div>
      ${krs.length ? `<ul class="retro-krs">${krs.map(k => {
        const t = k.tarefas || [], f = t.filter(x => x.feito).length;
        return `<li class="${k.concluido ? 'ok' : 'pend'}"><span class="st">${k.concluido ? '✓' : '✕'}</span>
          ${esc(k.area || '—')} | ${esc(k.titulo || 'Sem título')} <span class="muted small">· ${esc(k.responsavel || '—')} · 💪 ${k.esforco || 0}${t.length ? ` · ${f}/${t.length} tarefas` : ''}</span></li>`;
      }).join('')}</ul>` : ''}
    </div>`;
  }

  function krHTML(k) {
    const dis = canEdit ? '' : 'disabled';
    const t = k.tarefas || [];
    const f = t.filter(x => x.feito).length;
    const atrasado = !k.concluido && k.prazo && k.prazo < dates.today();
    return `<article class="card kr ${k.concluido ? 'done' : ''}" data-kr="${esc(k.id)}">
      <div class="kr-head">
        <span class="kr-ico">🦾</span><span class="kr-pre">KR's -</span>
        <input class="v kr-area" data-k="area" value="${esc(k.area || '')}" list="dl-areas" placeholder="Área" ${dis}>
        <span class="kr-sep">|</span>
        <input class="v kr-titulo" data-k="titulo" value="${esc(k.titulo || '')}" placeholder="Nome do KR" ${dis}>
        <label class="kr-done"><input type="checkbox" data-k="concluido" ${k.concluido ? 'checked' : ''} ${dis}> Concluído</label>
        ${canEdit ? '<button class="icon-btn small kr-rm" title="Excluir KR" aria-label="Excluir KR">×</button>' : ''}
      </div>
      <div class="kr-props">
        <label title="Prioridade">🏆 <input class="v num" type="number" min="1" data-k="prioridade" value="${esc(k.prioridade ?? '')}" ${dis}></label>
        <label title="Esforço (Fibonacci)">💪 <select class="v" data-k="esforco" ${dis}><option value=""></option>${FIB.map(n => `<option ${Number(k.esforco) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label title="Responsável">👤 <input class="v" data-k="responsavel" value="${esc(k.responsavel || '')}" list="dl-resp" placeholder="Responsável" ${dis}></label>
        <label title="Prazo" class="${atrasado ? 'atrasado' : ''}">📅 <input class="v" type="date" data-k="prazo" value="${esc(k.prazo || '')}" ${dis}></label>
        ${t.length ? `<span class="kr-prog"><span style="width:${Math.round(f / t.length * 100)}%"></span></span><span class="muted small">${f}/${t.length}</span>` : ''}
      </div>
      <ul class="kr-tarefas">${t.map(x => `<li class="${x.feito ? 'feito' : ''}" data-t="${esc(x.id)}">
          <input type="checkbox" data-tf="feito" ${x.feito ? 'checked' : ''} ${dis} aria-label="Concluir tarefa"><span class="play">▶️</span>
          <input class="v" data-tf="texto" value="${esc(x.texto || '')}" ${dis}>
          <input class="v data" type="date" data-tf="data" value="${esc(x.data || '')}" ${dis}>
          ${canEdit ? '<button class="icon-btn small" data-tf-rm title="Remover tarefa" aria-label="Remover tarefa">×</button>' : ''}</li>`).join('')}
        ${canEdit ? `<li class="nova-tarefa"><span class="play">▶️</span><input class="v" placeholder="Nova tarefa… (Enter para adicionar)" data-nova><input class="v data" type="date" data-nova-data></li>` : ''}
      </ul>
    </article>`;
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

  // ---------- eventos ----------
  function bind(s) {
    const box = $('#sprint');
    $$('[data-s]', box).forEach(i => i.addEventListener('change', () => {
      if (!i.value) return;
      if (i.dataset.s === 'inicio' && sprints().some(x => x.id !== s.id && x.inicio === i.value)) { toast('Já existe uma sprint começando nesse dia', 'error'); i.value = s.inicio; return; }
      s[i.dataset.s] = i.value;
      if (s.fim < s.inicio) s.fim = dates.addDays(s.inicio, 4);
      salvar(s, true); render();
    }));
    $$('[data-retro]', box).forEach(i => i.addEventListener('input', () => { s.retro = { ...(s.retro || {}), [i.dataset.retro]: i.value }; salvar(s); }));
    $$('[data-m]', box).forEach(i => i.addEventListener('change', () => {
      const manual = { ...(s.dados?.manual || {}) };
      const v = parse.num(i.value);
      if (v === null) delete manual[i.dataset.m]; else manual[i.dataset.m] = v;
      s.dados = { ...(s.dados || {}), manual };
      salvar(s, true); render();
    }));
    $('[data-ir]', box)?.addEventListener('click', e => { atualId = e.target.dataset.ir; render(); });
    $('#novo-kr', box)?.addEventListener('click', () => novoKR(s));
    $('#copiar', box).addEventListener('click', () => copiar(s));
    $('#excluir-sprint', box)?.addEventListener('click', () => excluirSprint(s));

    $$('.kr', box).forEach(el => {
      const k = registros.find(r => r.id === el.dataset.kr);
      $$('[data-k]', el).forEach(i => i.addEventListener(i.type === 'checkbox' || i.tagName === 'SELECT' || i.type === 'date' ? 'change' : 'input', () => {
        const c = i.dataset.k;
        k[c] = i.type === 'checkbox' ? i.checked : c === 'esforco' || c === 'prioridade' ? parse.num(i.value) : i.value.trim() || null;
        // status, esforço e prazo mudam os totais: salva e redesenha na hora; textos salvam quando a pessoa para de digitar
        if (['concluido', 'esforco', 'prazo'].includes(c)) { salvar(k, true); render(); } else salvar(k);
      }));
      // área e prioridade mudam a ordem dos KRs: reordena ao sair do campo
      $$('[data-k="area"], [data-k="prioridade"]', el).forEach(i => i.addEventListener('change', () => render()));
      $('.kr-rm', el)?.addEventListener('click', async () => {
        if (!confirm(`Excluir o KR "${k.titulo || 'sem título'}" e as tarefas dele?`)) return;
        try { await Store.remove(TABELA, k.id); registros = registros.filter(r => r.id !== k.id); render(); } catch (e) { toast(e.message, 'error'); }
      });
      $$('.kr-tarefas li[data-t]', el).forEach(li => {
        const t = (k.tarefas || []).find(x => x.id === li.dataset.t);
        $$('[data-tf]', li).forEach(i => i.addEventListener(i.type === 'checkbox' || i.type === 'date' ? 'change' : 'input', () => {
          t[i.dataset.tf] = i.type === 'checkbox' ? i.checked : i.value.trim() || null;
          if (i.type === 'checkbox') { salvar(k, true); render(); } else salvar(k);
        }));
        $('[data-tf-rm]', li)?.addEventListener('click', () => { k.tarefas = k.tarefas.filter(x => x.id !== t.id); salvar(k, true); render(); });
      });
      const nova = $('[data-nova]', el);
      nova?.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || !nova.value.trim()) return;
        e.preventDefault();
        k.tarefas = [...(k.tarefas || []), { id: Store.uid(), texto: nova.value.trim(), data: $('[data-nova-data]', el).value || null, feito: false }];
        salvar(k, true); render();
        setTimeout(() => $(`.kr[data-kr="${k.id}"] [data-nova]`)?.focus(), 30);
      });
    });
  }

  async function novaSprint() {
    const hoje = segunda(dates.today());
    const inicio = sprints().some(x => x.inicio === hoje) ? dates.addDays(hoje, 7) : hoje;
    const ant = sprints().find(x => x.inicio < inicio);
    const pend = ant ? krsDe(ant.id).filter(k => !k.concluido) : [];
    openModal({
      title: 'Nova sprint',
      body: `<div class="form-grid">
        <label class="field"><span>Início</span><input class="input" type="date" name="inicio" value="${inicio}"></label>
        <label class="field"><span>Fim</span><input class="input" type="date" name="fim" value="${dates.addDays(inicio, 4)}"></label>
        ${pend.length ? `<label class="check wide"><input type="checkbox" name="trazer" checked> Trazer os ${pend.length} KR(s) não concluído(s) da ${esc(tituloSprint(ant))}, com as tarefas pendentes</label>` : ''}
      </div>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost' },
        { label: 'Criar sprint', cls: 'primary', onClick: async dl => {
          const ini = $('[name=inicio]', dl).value, fim = $('[name=fim]', dl).value || dates.addDays(ini, 4);
          if (!ini) throw new Error('Informe a data de início');
          if (sprints().some(x => x.inicio === ini)) throw new Error('Já existe uma sprint começando nesse dia');
          const s = { id: 's_' + ini, tipo: 'sprint', inicio: ini, fim: fim < ini ? dates.addDays(ini, 4) : fim, retro: {}, dados: {}, criado_em: new Date().toISOString(), criado_por: eu };
          const novos = [s];
          if ($('[name=trazer]', dl)?.checked) pend.forEach(k => novos.push({
            ...structuredClone(k), id: 'kr_' + Store.uid(), sprint: s.id, concluido: false, criado_em: new Date().toISOString(),
            tarefas: (k.tarefas || []).filter(t => !t.feito).map(t => ({ ...t, id: Store.uid() })), veio_de: k.id,
          }));
          await Store.saveMany(TABELA, novos);
          registros.push(...novos.map(r => ({ ...r })));
          atualId = s.id;
          render();
          toast('Sprint criada', 'ok');
        } },
      ],
    });
  }

  async function novoKR(s) {
    const k = { id: 'kr_' + Store.uid(), tipo: 'kr', sprint: s.id, area: '', titulo: '', prioridade: null, esforco: null, responsavel: '', prazo: s.fim, concluido: false, tarefas: [], criado_em: new Date().toISOString() };
    registros.push(k);
    await salvar(k, true);
    render();
    $(`.kr[data-kr="${k.id}"] .kr-area`)?.focus();
  }

  async function excluirSprint(s) {
    const krs = krsDe(s.id);
    if (!confirm(`Excluir a ${tituloSprint(s)} e os ${krs.length} KR(s) dela? Isso não pode ser desfeito.`)) return;
    try {
      for (const r of [...krs, s]) await Store.remove(TABELA, r.id);
      registros = registros.filter(r => r.id !== s.id && r.sprint !== s.id);
      atualId = sprints()[0]?.id || null;
      render();
      toast('Sprint excluída');
    } catch (e) { toast(e.message, 'error'); }
  }

  // texto no mesmo formato do documento da sprint (para colar no ClickUp, WhatsApp…)
  async function copiar(s) {
    const krs = krsDe(s.id), p = pontos(krs);
    const auto = s.dados?.auto || {}, manual = s.dados?.manual || {};
    const L = [tituloSprint(s), '', FIB.join(', '), ''];
    let area = null;
    krs.forEach(k => {
      if (area !== null && k.area !== area) L.push('-'.repeat(50), '');
      area = k.area;
      L.push(`🦾 KR's - ${k.area || '—'} | ${k.titulo || '—'}${k.concluido ? ' ✅' : ''}`,
        `    🏆 ${k.prioridade ?? '—'}`, `    💪 ${k.esforco ?? '—'}`, `    👤 ${k.responsavel || '—'}`, `    📅 ${ddmm(k.prazo)}`,
        ...(k.tarefas || []).map(t => `    ${t.feito ? '✅' : '▶️'} ${t.texto || ''}${t.data ? ` (${ddmm(t.data)})` : ''}`), '');
    });
    L.push(`    💪 - ${p.feitos}/${p.total}`, '-'.repeat(50), '', 'Coleta de Dados');
    LINHAS().forEach(l => {
      if (l.grupo) return L.push('', l.grupo);
      const v = isBlank(manual[l.k]) ? auto[l.k] : manual[l.k];
      L.push(`${l.label}: ${isBlank(v) ? '—' : l.moeda ? fmt.money(v) : v}`);
    });
    const r = s.retro || {};
    if (r.positivos || r.melhorar || r.acoes) L.push('', 'Retrospectiva', `✅ ${r.positivos || '—'}`, `⚠️ ${r.melhorar || '—'}`, `🎯 ${r.acoes || '—'}`);
    const txt = L.join('\n');
    try { await navigator.clipboard.writeText(txt); toast('Texto da sprint copiado', 'ok'); }
    catch { openModal({ title: 'Copie o texto', body: `<textarea class="input mono" rows="16" readonly>${esc(txt)}</textarea>`, actions: [{ label: 'Fechar', cls: 'ghost' }] }); }
  }

  // ---------- carregar ----------
  async function carregar(manterSelecao = true) {
    try {
      const [regs, deals] = await Promise.all([Store.list(TABELA), lerCRM ? Store.list('crm').catch(() => []) : []]);
      // não perde o que está sendo digitado (registros com salvamento pendente ficam com a versão local)
      const pend = new Set(Object.keys(timers));
      registros = [...regs.filter(r => !pend.has(r.id)), ...registros.filter(r => pend.has(r.id))];
      crm = deals;
    } catch (e) { toast('Erro ao carregar as sprints: ' + e.message, 'error'); }
    const lista = sprints();
    if (!manterSelecao || !lista.some(s => s.id === atualId)) {
      const hoje = dates.today();
      atualId = (lista.find(s => s.inicio <= hoje && s.fim >= hoje) || lista[0])?.id || null;
    }
    render();
  }

  $('#sprint').addEventListener('focusin', () => { digitando = true; });
  $('#sprint').addEventListener('focusout', () => { digitando = false; });
  $('#sel-sprint').addEventListener('change', e => { atualId = e.target.value; render(); });
  $('#ant').addEventListener('click', () => { const l = sprints(), i = l.findIndex(s => s.id === atualId); if (l[i + 1]) { atualId = l[i + 1].id; render(); } });
  $('#prox').addEventListener('click', () => { const l = sprints(), i = l.findIndex(s => s.id === atualId); if (i > 0) { atualId = l[i - 1].id; render(); } });
  if (canEdit) $('#nova-sprint').addEventListener('click', novaSprint);
  else $('#nova-sprint').replaceWith(Object.assign(document.createElement('span'), { className: 'badge neutral', textContent: 'Somente visualização' }));
  // atualizações feitas por outras pessoas aparecem sozinhas
  setInterval(() => { if (!digitando && !Object.keys(timers).length && !document.hidden && !document.querySelector('dialog[open]')) carregar(); }, 30000);
  carregar(false);
})();
