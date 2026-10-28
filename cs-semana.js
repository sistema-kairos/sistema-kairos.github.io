// CS → Registro semanal: lançamento das ações da semana (tabela 'cs_semana', um registro por pessoa e semana).
(() => {
  if (window.SEM_ACESSO) return;
  const canEdit = Store.podeEditar('cs_semana');
  let seg = Estagio.segundaDe(dates.today()), pessoa = Estagio.email();
  let regs = [], rotinas = [], cs = [];

  const atual = () => regs.find(r => r.usuario === pessoa && r.semana === seg);

  async function carregar() {
    try {
      [regs, rotinas, cs] = await Promise.all([Store.list('cs_semana'), Store.list('cs_rotina').catch(() => []), Store.list('cs').catch(() => [])]);
    } catch (e) { toast('Erro ao carregar: ' + e.message, 'error'); }
    // administradores e gestores escolhem de quem é o registro
    const pessoas = [...new Map([[Estagio.email(), Estagio.nome()], ...regs.map(r => [r.usuario, r.nome || r.usuario])]).entries()];
    if (pessoas.length > 1) {
      $('#pessoa').innerHTML = pessoas.map(([e, n]) => `<option value="${esc(e)}">${esc(n)}</option>`).join('');
      $('#pessoa').value = pessoa;
      $('#pessoa').hidden = false;
    }
    render();
  }

  // sugestões: dias de checagem pela rotina, base de clientes da semana anterior, campos automáticos do CS
  function sugestoes() {
    const dias = Estagio.diasUteis(seg);
    const checagem = rotinas.filter(r => r.usuario === pessoa && dias.includes(r.data) && r.feitos?.abastecimento).length;
    const ant = regs.find(r => r.usuario === pessoa && r.semana === dates.addDays(seg, -7));
    return { dias_checagem: rotinas.some(r => r.usuario === pessoa && dias.includes(r.data)) ? checagem : null,
      base_clientes: ant?.base_clientes ?? 50, ...Estagio.autoCS(cs, seg) };
  }

  function campoHTML(c, v, sug) {
    const vazio = isBlank(v), val = vazio && !isBlank(sug) ? sug : v;
    const tag = c.auto ? ' <span class="badge neutral">automático</span>' : (c.key === 'dias_checagem' && vazio && !isBlank(sug) ? ' <span class="badge neutral">pela rotina</span>' : '');
    const dis = canEdit ? '' : 'disabled';
    const input = c.tipo === 'sim'
      ? `<select class="input" name="${c.key}" ${dis}><option value="">—</option>${['Sim', 'Não'].map(o => `<option ${val === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
      : `<input class="input" name="${c.key}" type="number" min="0" ${c.key === 'dias_checagem' ? 'max="5"' : ''} step="${c.tipo === 'money' ? '0.01' : '1'}" value="${isBlank(val) ? '' : esc(val)}" ${dis}>`;
    return `<label class="field"><span>${esc(c.label)}${tag}</span>${input}<small class="muted">Indicador ${esc(c.ind)}</small></label>`;
  }

  function render() {
    $('#semana-txt').textContent = `Semana de ${Estagio.semanaTxt(seg)}/${seg.slice(0, 4)}`;
    const r = atual() || {}, sug = sugestoes();
    $('#salvo').textContent = r.updated_at ? `Salvo ${fmt.ago(r.updated_at)}` : 'Ainda não lançado';
    $('#form').innerHTML = Estagio.CAMPOS_SEMANA.map(g => `<section class="card et-grupo">
      <h3>${esc(g.grupo)}</h3><div class="form-grid">${g.campos.map(c => campoHTML(c, r[c.key], sug[c.key])).join('')}</div></section>`).join('')
      + `<section class="card et-grupo"><h3>Comentários da semana</h3><label class="field wide"><textarea class="input" name="comentario" rows="3" ${canEdit ? '' : 'disabled'} placeholder="O que deu certo, o que travou, pedidos de apoio…">${esc(r.comentario || '')}</textarea></label></section>`;
    $('#salvar').hidden = !canEdit;
  }

  async function salvar() {
    const fd = new FormData($('#form')), rec = { ...(atual() || {}) };
    for (const c of Estagio.CAMPOS) {
      const v = fd.get(c.key);
      rec[c.key] = c.tipo === 'sim' ? (v || null) : parse.num(v);
    }
    if (!isBlank(rec.dias_checagem) && (rec.dias_checagem < 0 || rec.dias_checagem > 5)) return toast('Dias com checagem vai de 0 a 5.', 'error');
    const pares = [['sinalizados_contatados', 'sinalizados'], ['contatos_performance', 'base_clientes'], ['recomendacoes_aplicadas', 'recomendacoes_enviadas'],
      ['demandas_prazo', 'demandas_total'], ['erros_registrados', 'erros_ocorridos'], ['onb_prazo', 'onb_previstas'], ['reunioes_prazo', 'avisos_novos'], ['avisos_revertidos', 'avisos_com_reuniao']];
    const errado = pares.find(([a, b]) => !isBlank(rec[a]) && !isBlank(rec[b]) && rec[a] > rec[b]);
    if (errado) {
      const l = k => Estagio.CAMPOS.find(c => c.key === k).label;
      return toast(`"${l(errado[0])}" não pode ser maior que "${l(errado[1])}".`, 'error');
    }
    rec.comentario = fd.get('comentario') || '';
    Object.assign(rec, { id: `${pessoa}|${seg}`, usuario: pessoa, semana: seg,
      nome: pessoa === Estagio.email() ? Estagio.nome() : (rec.nome || pessoa) });
    $('#salvar').disabled = true;
    try {
      const salvo = await Store.save('cs_semana', rec);
      regs = [salvo, ...regs.filter(x => x.id !== salvo.id)];
      toast('Registro da semana salvo', 'ok');
      render();
    } catch (e) { toast(e.message, 'error'); }
    finally { $('#salvar').disabled = false; }
  }

  $('#salvar').addEventListener('click', salvar);
  $('#pessoa').addEventListener('change', () => { pessoa = $('#pessoa').value; render(); });
  $('#ant').addEventListener('click', () => { seg = dates.addDays(seg, -7); render(); });
  $('#prox').addEventListener('click', () => { seg = dates.addDays(seg, 7); render(); });
  $('#atual').addEventListener('click', () => { seg = Estagio.segundaDe(dates.today()); render(); });
  carregar();
})();
