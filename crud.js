// Página genérica de cadastro: tabela com busca/filtro/ordenação, formulário,
// importação de planilha (colar do Excel/Sheets ou arquivo CSV) e exportação CSV.
function CrudPage(opts) {
  const { el, table, fields, filterKey, onChange, suggestions = {}, validate, idOf, canDelete } = opts;
  const root = $(el);
  if (!root) return { reload() {} };
  // sem permissão de edição (Espectador ou outra área): só consulta
  const readOnly = opts.readOnly ?? !Store.podeEditar(table);
  const F = Object.fromEntries(fields.map(f => [f.key, f]));
  const listFields = fields.filter(f => f.list);
  let rows = [];
  let sortKey = opts.sortKey || 'updated_at';
  let sortDir = -1;

  root.innerHTML = `
    <div class="toolbar">
      <input type="search" class="input search" placeholder="Buscar em todos os campos…">
      ${filterKey ? `<select class="input filter"><option value="">${esc(F[filterKey].label)}: todos</option>
        ${F[filterKey].options.map(o => `<option>${esc(o)}</option>`).join('')}</select>` : ''}
      <span class="muted small count"></span>
      <div class="spacer"></div>
      ${readOnly ? '<span class="badge neutral">Somente visualização</span>' : '<button class="btn ghost" data-act="import">Importar planilha</button>'}
      <button class="btn ghost" data-act="export">Exportar CSV</button>
      ${readOnly ? '' : '<button class="btn primary" data-act="new">+ Novo registro</button>'}
    </div>
    <div class="card table-card">
      <div class="table-wrap"><table class="data"><thead></thead><tbody></tbody></table></div>
      <div class="empty hidden">Nenhum registro encontrado.</div>
    </div>`;

  const search = $('.search', root);
  const filter = $('.filter', root);
  search.addEventListener('input', render);
  filter?.addEventListener('change', render);
  $('[data-act=new]', root)?.addEventListener('click', () => openForm(null));
  $('[data-act=export]', root).addEventListener('click', exportCSV);
  $('[data-act=import]', root)?.addEventListener('click', openImport);

  // ---------- tabela ----------
  function cell(f, v) {
    switch (f.type) {
      case 'money': return fmt.money(v);
      case 'percent': return fmt.pct(v);
      case 'date': return fmt.date(v);
      case 'datetime': return fmt.dateTime(v);
      case 'month': return fmt.month(v);
      case 'months': return isBlank(v) ? '—' : `${fmt.num(v)} meses`;
      case 'int': return fmt.num(v, 0);
      default: return isBlank(v) ? '—' : esc(v);
    }
  }
  const numeric = f => ['money', 'percent', 'int', 'months'].includes(f?.type);

  function render() {
    const q = norm(search.value);
    const fv = filter?.value;
    const shown = rows
      .filter(r => (!fv || r[filterKey] === fv) && (!q || fields.some(f => norm(r[f.key]).includes(q))))
      .sort((a, b) => {
        const x = a[sortKey], y = b[sortKey];
        if (isBlank(x)) return 1;
        if (isBlank(y)) return -1;
        return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')) * sortDir;
      });

    $('thead', root).innerHTML = `<tr>${listFields.map(f =>
      `<th data-key="${f.key}" class="${numeric(f) ? 'num' : ''}">${esc(f.label)}${sortKey === f.key ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr>`;
    $('tbody', root).innerHTML = shown.map(r =>
      `<tr data-id="${esc(r.id)}">${listFields.map(f => `<td class="${numeric(f) ? 'num' : ['tel', 'date', 'datetime', 'month'].includes(f.type) ? 'nowrap' : ''}">${cell(f, r[f.key])}</td>`).join('')}</tr>`).join('');
    $('.empty', root).classList.toggle('hidden', shown.length > 0);
    $('.count', root).textContent = `${shown.length} de ${rows.length} registros`;

    $$('th', root).forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.key;
      sortDir = sortKey === k ? -sortDir : 1;
      sortKey = k;
      render();
    }));
    $$('tbody tr', root).forEach(tr => tr.addEventListener('click', () => openForm(rows.find(r => r.id === tr.dataset.id))));
  }

  async function load() {
    try { rows = await Store.list(table); }
    catch (e) { toast('Erro ao carregar dados: ' + e.message, 'error'); rows = []; }
    render();
  }

  // ---------- formulário ----------
  function datalistFor(f) {
    const vals = new Set([...(suggestions[f.key] || []), ...(f.suggest ? rows.map(r => r[f.key]).filter(Boolean) : [])]);
    if (!vals.size) return '';
    return `<datalist id="dl_${f.key}">${[...vals].sort().map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  }

  function fieldHTML(f, v) {
    const attrs = `id="f_${f.key}" name="${f.key}" ${f.required ? 'required' : ''} ${f.readonly ? 'readonly tabindex="-1"' : ''}`;
    const val = esc(v ?? '');
    let input;
    switch (f.type) {
      case 'select':
        input = `<select class="input" ${attrs}><option value=""></option>${f.options.map(o =>
          `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        break;
      case 'textarea':
        input = `<textarea class="input" rows="3" ${attrs}>${val}</textarea>`;
        break;
      case 'money': case 'percent': case 'int': case 'months':
        input = `<div class="affix">${f.type === 'money' ? '<span>R$</span>' : ''}
          <input class="input" type="number" step="${f.type === 'int' ? '1' : 'any'}" inputmode="decimal" value="${val}" ${attrs}>
          ${f.type === 'percent' ? '<span>%</span>' : f.type === 'months' ? '<span>meses</span>' : ''}</div>`;
        break;
      case 'date': case 'month': case 'email': case 'tel':
        input = `<input class="input" type="${f.type}" value="${val}" ${attrs}>`;
        break;
      case 'datetime': // só exibição; o valor original é mantido ao salvar
        input = `<input class="input" type="text" value="${esc(fmt.dateTime(v))}" readonly tabindex="-1">`;
        break;
      default: {
        const dl = datalistFor(f);
        input = `<input class="input" type="text" value="${val}" ${dl ? `list="dl_${f.key}"` : ''} ${f.type === 'cnpj' ? 'placeholder="00.000.000/0000-00" maxlength="18"' : ''} ${attrs}>${dl}`;
      }
    }
    return `<label class="field ${f.type === 'textarea' ? 'wide' : ''}">
      <span>${esc(f.label)}${f.required ? ' *' : ''}</span>${input}
      ${f.hint ? `<small class="muted">${esc(f.hint)}</small>` : ''}</label>`;
  }

  function readForm(form) {
    const rec = {};
    for (const f of fields) {
      if (f.type === 'datetime') continue;
      const raw = form.elements[f.key]?.value?.trim() ?? '';
      rec[f.key] = ['money', 'percent', 'int', 'months'].includes(f.type) ? parse.num(raw) : (raw || null);
    }
    return applyForced(rec);
  }

  // campos com `forced`: quando a regra devolve um valor, o campo assume esse valor e fica travado
  function applyForced(rec) {
    for (const f of fields) {
      if (!f.forced) continue;
      const v = f.forced(rec);
      if (v !== undefined) rec[f.key] = v;
    }
    return rec;
  }
  function syncForced(form, rec) {
    for (const f of fields) {
      const i = form.elements[f.key];
      if (!f.forced || !i) continue;
      const v = f.forced(rec);
      if (v !== undefined) i.value = v ?? '';
      i.readOnly = v !== undefined || !!f.readonly;
    }
  }

  function setValue(form, key, v) { const i = form.elements[key]; if (i) i.value = v ?? ''; }

  // recalcula campos com `compute` cujas dependências mudaram
  function runComputed(rec, changed) {
    const ch = new Set(changed);
    for (const f of fields) {
      if (f.compute && f.deps.some(d => ch.has(d))) {
        const nv = f.compute(rec);
        if (nv !== rec[f.key]) { rec[f.key] = nv; ch.add(f.key); }
      }
    }
    return rec;
  }

  function openForm(rec) {
    const isNew = !rec;
    const base = rec ? { ...rec } : Object.fromEntries(fields.filter(f => 'default' in f).map(f => [f.key, f.default]));
    const dlg = openModal({
      title: isNew ? 'Novo registro' : `${readOnly ? '' : 'Editar: '}${rec[fields[0].key] || ''}`,
      wide: true,
      body: `<form class="form-grid" novalidate>${fields.map(f => fieldHTML(f, base[f.key])).join('')}</form>
        ${!isNew ? `<p class="muted small">Última alteração: ${fmt.dateTime(rec.updated_at)}</p>` : ''}`,
      actions: readOnly ? [{ label: 'Fechar', cls: 'ghost' }] : [
        ...(!isNew ? [{ label: 'Excluir', cls: 'danger left', onClick: async () => {
          const block = canDelete?.(rec);
          if (block) { toast(block, 'error'); return false; }
          if (!confirm('Excluir este registro definitivamente?')) return false;
          await Store.remove(table, rec.id);
          toast('Registro excluído');
          await load();
        } }] : []),
        { label: 'Cancelar', cls: 'ghost' },
        { label: 'Salvar', cls: 'primary', onClick: async d => {
          const form = $('form', d);
          if (!form.reportValidity()) return false;
          const out = { ...base, ...readForm(form) };
          const erro = validate?.(out, isNew, rows);
          if (erro) { toast(erro, 'error'); return false; }
          if (isNew && idOf) out.id = idOf(out);
          await Store.save(table, out);
          toast('Registro salvo', 'ok');
          await load();
        } },
      ],
    });
    const form = $('form', dlg);
    form.addEventListener('submit', e => e.preventDefault());
    const cnpj = form.elements.cnpj;
    if (cnpj) cnpj.addEventListener('input', () => { cnpj.value = maskCNPJ(cnpj.value); });
    const tel = form.elements.telefone;
    if (tel) tel.addEventListener('input', () => { tel.value = maskPhone(tel.value); });
    syncForced(form, base);
    if (!isNew) fields.filter(f => f.lockOnEdit).forEach(f => { const i = form.elements[f.key]; if (i) i.readOnly = true; });
    if (readOnly) $$('input, select, textarea', form).forEach(i => { i.disabled = true; });

    form.addEventListener('change', e => {
      const key = e.target.name;
      let cur = readForm(form);
      if (onChange) {
        const patch = onChange(key, cur) || {};
        Object.entries(patch).forEach(([k, v]) => setValue(form, k, v));
        cur = { ...cur, ...patch };
        const after = runComputed(cur, [key, ...Object.keys(patch)]);
        fields.filter(f => f.compute).forEach(f => setValue(form, f.key, after[f.key]));
        syncForced(form, after);
        return;
      }
      const after = runComputed(cur, [key]);
      fields.filter(f => f.compute).forEach(f => setValue(form, f.key, after[f.key]));
      syncForced(form, after);
    });
    form.elements[fields[0].key]?.focus();
  }

  // ---------- exportação ----------
  function exportValue(f, v) {
    if (isBlank(v)) return '';
    if (f.type === 'date') return fmt.date(v);
    if (f.type === 'datetime') return fmt.dateTime(v);
    if (f.type === 'month') return `${v.slice(5, 7)}/${v.slice(0, 4)}`;
    if (typeof v === 'number') return String(v).replace('.', ',');
    return String(v);
  }
  function exportCSV() {
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [fields.map(f => q(f.label)).join(';'),
      ...rows.map(r => fields.map(f => q(exportValue(f, r[f.key]))).join(';'))];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${table}-${dates.today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- importação ----------
  function openImport() {
    let parsed = null;
    const dlg = openModal({
      title: 'Importar planilha',
      wide: true,
      body: `
        <p>Copie as linhas da planilha (Excel ou Google Sheets) <strong>incluindo a linha de cabeçalho</strong> e cole abaixo,
        ou selecione um arquivo CSV. As colunas são reconhecidas pelo nome.</p>
        <textarea class="input mono" rows="8" placeholder="Cole aqui…"></textarea>
        <div class="row"><input type="file" accept=".csv,.tsv,.txt"></div>
        <div class="import-preview muted small"></div>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost' },
        { label: 'Importar', cls: 'primary', onClick: async () => {
          if (!parsed?.records.length) { toast('Nada para importar'); return false; }
          await Store.saveMany(table, parsed.records);
          toast(`${parsed.records.length} registros importados`, 'ok');
          await load();
        } },
      ],
    });
    const ta = $('textarea', dlg);
    const preview = $('.import-preview', dlg);
    const update = () => {
      parsed = buildImport(ta.value);
      preview.innerHTML = !parsed ? '' : `
        <strong>${parsed.records.length} linhas</strong> prontas para importar.<br>
        Colunas reconhecidas: ${parsed.matched.map(esc).join(', ') || 'nenhuma'}<br>
        ${parsed.ignored.length ? `Colunas ignoradas: ${parsed.ignored.map(esc).join(', ')}` : ''}`;
    };
    ta.addEventListener('input', update);
    $('input[type=file]', dlg).addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      ta.value = await file.text();
      update();
    });
  }

  function buildImport(text) {
    text = text.replace(/^﻿/, '');
    if (!text.trim()) return null;
    const first = text.split(/\r?\n/)[0];
    const delim = first.includes('\t') ? '\t' : (first.split(';').length >= first.split(',').length ? ';' : ',');
    const table_ = parseDelimited(text, delim);
    if (table_.length < 2) return null;
    const header = table_[0];
    const lookup = {};
    fields.forEach(f => [f.label, f.key, ...(f.aliases || [])].forEach(n => { lookup[norm(n)] = f; }));
    const map = header.map(h => lookup[norm(h)] || null);
    const records = table_.slice(1)
      .filter(r => r.some(c => c.trim()))
      .map(r => {
        const rec = {};
        map.forEach((f, i) => { if (f) rec[f.key] = convert(f, r[i]); });
        fields.filter(f => 'default' in f && isBlank(rec[f.key])).forEach(f => { rec[f.key] = f.default; });
        if (onChange) Object.assign(rec, Object.fromEntries(Object.entries(onChange(null, rec) || {}).filter(([k]) => isBlank(rec[k]))));
        return applyForced(runComputed(rec, fields.map(f => f.key)));
      });
    return {
      records,
      matched: header.filter((_, i) => map[i]),
      ignored: header.filter((h, i) => !map[i] && h.trim()),
    };
  }

  function convert(f, raw) {
    const v = (raw ?? '').trim();
    if (!v) return null;
    switch (f.type) {
      case 'money': case 'int': case 'months': return parse.num(v);
      case 'percent': {
        const n = parse.num(v);
        return n !== null && !v.includes('%') && Math.abs(n) < 1 && n !== 0 ? n * 100 : n; // 0,05 → 5%
      }
      case 'date': return parse.date(v);
      case 'month': return parse.month(v);
      case 'select': return f.options.find(o => norm(o) === norm(v)) || v;
      default: return v;
    }
  }

  load();
  return { reload: load };
}

function parseDelimited(text, delim) {
  const out = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"' && cur === '') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); out.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out;
}

function maskCNPJ(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12)];
  return parts[0] + (parts[1] ? '.' + parts[1] : '') + (parts[2] ? '.' + parts[2] : '')
    + (parts[3] ? '/' + parts[3] : '') + (parts[4] ? '-' + parts[4] : '');
}
function maskPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}
