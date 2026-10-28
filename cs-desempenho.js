// CS → Desempenho: painel semanal dos indicadores A a U (ver estagio.js) + rotina cumprida + histórico de 6 semanas.
(() => {
  if (window.SEM_ACESSO) return;
  let regs = [], rotinas = [], pessoa = Estagio.email(), seg = Estagio.segundaDe(dates.today());

  async function carregar() {
    try { [regs, rotinas] = await Promise.all([Store.list('cs_semana'), Store.list('cs_rotina').catch(() => [])]); }
    catch (e) { toast('Erro ao carregar: ' + e.message, 'error'); }
    const pessoas = [...new Map([...regs, ...rotinas].map(r => [r.usuario, r.nome || r.usuario])).entries()];
    if (!pessoas.some(([e]) => e === pessoa)) pessoas.unshift([pessoa, Estagio.nome()]);
    // abre na pessoa com registro mais recente (o gestor normalmente quer ver o estagiário)
    const ultimo = regs.slice().sort((a, b) => String(b.semana).localeCompare(String(a.semana)))[0];
    if (ultimo && !regs.some(r => r.usuario === pessoa)) pessoa = ultimo.usuario;
    if (ultimo && !regs.some(r => r.usuario === pessoa && r.semana === seg)) {
      const s = regs.filter(r => r.usuario === pessoa).map(r => r.semana).sort().pop();
      if (s) seg = s;
    }
    $('#pessoa').innerHTML = pessoas.map(([e, n]) => `<option value="${esc(e)}">${esc(n)}</option>`).join('');
    $('#pessoa').value = pessoa;
    render();
  }

  const regDe = s => regs.find(r => r.usuario === pessoa && r.semana === s) || null;
  function rotinaDe(s) {
    const dias = Estagio.diasUteis(s);
    const total = dias.reduce((n, d) => n + Estagio.rotina(d).length, 0);
    const feitos = dias.reduce((n, d) => { const r = rotinas.find(x => x.usuario === pessoa && x.data === d); return n + Estagio.rotina(d).filter(b => r?.feitos?.[b.id]).length; }, 0);
    return { total, feitos, pct: total ? feitos / total * 100 : null };
  }
  function avaliar(s) {
    const r = regDe(s);
    if (!r) return null;
    const ctx = Estagio.contexto(regs, r);
    return Estagio.INDICADORES.map(ind => { const v = ind.calc(r, ctx); return { ind, v, st: Estagio.status(ind, v, s), sub: ind.sub ? ind.sub(r, ctx) : '' }; });
  }

  function render() {
    $('#semana-txt').textContent = `Semana de ${Estagio.semanaTxt(seg)}/${seg.slice(0, 4)}`;
    const res = avaliar(seg), rot = rotinaDe(seg);
    const comMeta = res ? res.filter(x => x.st) : [];
    const batidas = comMeta.filter(x => x.st === 'ok').length;
    $('#resumo-info').textContent = res ? '' : 'sem registro semanal nesta semana';
    Dash.kpis('#k-resumo', [
      { label: 'Metas batidas', value: comMeta.length ? `${batidas} de ${comMeta.length}` : '—', cls: comMeta.length && batidas < comMeta.length ? 'alerta' : '', sub: 'indicadores com meta e dado lançado' },
      { label: 'Rotina cumprida', value: rot.pct === null ? '—' : fmt.num(rot.pct, 0) + '%', cls: rot.pct !== null && rot.pct < 90 ? 'alerta' : '', sub: `${rot.feitos} de ${rot.total} blocos marcados` },
      { label: 'Abaixo da meta', value: comMeta.length ? String(comMeta.length - batidas) : '—', sub: comMeta.filter(x => x.st === 'alerta').map(x => x.ind.id).join(', ') || 'nenhum' },
    ]);

    const grupos = [...new Set(Estagio.INDICADORES.map(i => i.grupo))];
    $('#grupos').innerHTML = grupos.map(g => `<section class="dash-section">
      <div class="section-head"><h2>${esc(g)}</h2></div>
      <div class="kpis et-kpis">${Estagio.INDICADORES.filter(i => i.grupo === g).map(ind => {
        const x = res?.find(y => y.ind.id === ind.id);
        const v = x ? x.v : null, st = x ? x.st : '';
        const meta = ind.metaTxt ? `Meta: ${esc(ind.metaTxt)}` : 'Acompanhamento';
        return `<div class="card kpi et-kpi ${st}"><div class="label"><span class="et-id">${ind.id}</span> ${esc(ind.nome)}</div>
          <div class="value">${Estagio.valorTxt(ind, v)}</div>
          <div class="sub">${[x?.sub, meta].filter(Boolean).join(' · ')}</div></div>`;
      }).join('')}</div></section>`).join('');

    // histórico: 6 semanas terminando na selecionada
    const semanas = Array.from({ length: 6 }, (_, i) => dates.addDays(seg, -7 * (5 - i)));
    const aval = Object.fromEntries(semanas.map(s => [s, avaliar(s)]));
    $('#h-hist').innerHTML = `<tr><th>Indicador</th>${semanas.map(s => `<th class="num">${fmt.date(s).slice(0, 5)}</th>`).join('')}</tr>`;
    const linhaRotina = `<tr><td><b>Rotina cumprida</b></td>${semanas.map(s => { const r = rotinaDe(s); return `<td class="num ${r.pct === null || !r.feitos ? '' : r.pct >= 90 ? 'et-ok' : 'et-alerta'}">${r.feitos ? fmt.num(r.pct, 0) + '%' : '—'}</td>`; }).join('')}</tr>`;
    $('#t-hist').innerHTML = linhaRotina + Estagio.INDICADORES.map(ind => `<tr><td><span class="et-id">${ind.id}</span> ${esc(ind.nome)}</td>${semanas.map(s => {
      const x = aval[s]?.find(y => y.ind.id === ind.id);
      return `<td class="num ${x?.st === 'ok' ? 'et-ok' : x?.st === 'alerta' ? 'et-alerta' : ''}">${x ? Estagio.valorTxt(ind, x.v) : '—'}</td>`;
    }).join('')}</tr>`).join('');

    const r = regDe(seg);
    $('#comentario').hidden = !r?.comentario;
    $('#comentario').innerHTML = r?.comentario ? `<h3>Comentários da semana</h3><p>${esc(r.comentario).replace(/\n/g, '<br>')}</p>` : '';
  }

  $('#pessoa').addEventListener('change', () => { pessoa = $('#pessoa').value; render(); });
  $('#ant').addEventListener('click', () => { seg = dates.addDays(seg, -7); render(); });
  $('#prox').addEventListener('click', () => { seg = dates.addDays(seg, 7); render(); });
  carregar();
})();
