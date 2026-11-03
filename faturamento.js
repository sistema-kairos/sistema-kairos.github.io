// Faturamento dos clientes: dados da planilha "Faturamento Mensal" (importados pelo Apps Script) + espaço lançado pelo CS.
//   'cs_faturamento'  id = 'AAAA-MM' (aba "Cobrança MM/AAAA") → { mes, aba, linhas: [{ cliente, hub, modelo, dia, faturamento, pedidos, ... }] }
//   'cs_clientes'     id = chave do cliente → { cliente, espaco }
// Metas e regras ficam aqui para ajustar sem mexer nas telas.
const Fat = (() => {
  // meta de faturamento mensal por espaço ocupado
  const ESPACOS = [
    { id: '1/4', label: '1/4 de freezer', meta: 8000 },
    { id: '1/2', label: '1/2 freezer', meta: 14000 },
    { id: '1', label: '1 freezer', meta: 40000 },
    { id: 'outro', label: 'Outro (sem meta)', meta: null },
  ];
  const REGRAS = {
    quedaForte: -20,      // variação em relação ao mês anterior (%) que acende o alerta
    reuniaoQueda: -30,    // queda a partir da qual o CS marca reunião
    reuniaoMeta: 50,      // ou abaixo deste % da meta
    erroMax: 1,           // % de pedidos com erro acima do qual o cliente refaz o treinamento
  };
  const chave = s => norm(s);
  const metaDe = espaco => ESPACOS.find(e => e.id === espaco)?.meta ?? null;
  const espacoTxt = espaco => ESPACOS.find(e => e.id === espaco)?.label || '';

  // pedidos com erro citados na coluna OBS ("erro pedido 0732", "erros nos pedidos 8518, 2368")
  function errosObs(obs) {
    let n = 0;
    for (const m of String(obs || '').matchAll(/erros?\s*(?:n[oa]s?\s*)?(?:d[oe]s?\s*)?pedidos?\s*:?\s*([\d\s,.;e]+)/gi)) {
      n += (m[1].match(/\d{3,}/g) || []).length;
    }
    return n;
  }

  // une as linhas do mesmo cliente no mês (ex.: mesmo cliente em DS e DK)
  function porCliente(linhas) {
    const out = new Map();
    for (const l of linhas || []) {
      const k = chave(l.cliente);
      if (!k) continue;
      const a = out.get(k);
      if (!a) { out.set(k, { ...l, key: k, modelos: [l.modelo].filter(Boolean), erros: errosObs(l.obs) }); continue; }
      const soma = c => (isBlank(a[c]) && isBlank(l[c])) ? null : (Number(a[c]) || 0) + (Number(l[c]) || 0);
      Object.assign(a, { faturamento: soma('faturamento'), pedidos: soma('pedidos'), mensalidade: soma('mensalidade'),
        mensalidade_total: soma('mensalidade_total'), total_orion: soma('total_orion'), erros: a.erros + errosObs(l.obs),
        obs: [a.obs, l.obs].filter(Boolean).join(' · ') });
      if (l.modelo && !a.modelos.includes(l.modelo)) a.modelos.push(l.modelo);
    }
    return out;
  }

  async function carregar() {
    const [regs, esp, st] = await Promise.all([
      Store.list('cs_faturamento'), Store.list('cs_clientes').catch(() => []), Store.list('cs_faturamento_status').catch(() => []),
    ]);
    const meses = regs.map(r => r.mes || r.id).filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
    const porMes = Object.fromEntries(regs.map(r => [r.mes || r.id, { ...r, clientes: porCliente(r.linhas) }]));
    const espacos = Object.fromEntries(esp.map(r => [r.id, r]));
    return { meses, porMes, espacos, status: st.find(s => s.id === 'ultimo') || null };
  }

  const media = v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  // coeficiente de variação: quanto as vendas oscilam em torno da média (0% = sempre igual)
  function cv(v) {
    if (v.length < 3) return null;
    const m = media(v);
    if (!m) return null;
    return Math.sqrt(media(v.map(x => (x - m) ** 2))) / m * 100;
  }

  // visão de um mês: cada cliente com série, variação, meta e alertas
  function clientes(d, mes) {
    const i = d.meses.indexOf(mes);
    if (i < 0) return { ativos: [], saiu: [] };
    const atual = d.porMes[mes].clientes;
    const ant = i > 0 ? d.porMes[d.meses[i - 1]].clientes : null;
    const anteriores = d.meses.slice(Math.max(0, i - 5), i + 1);
    const ativos = [...atual.values()].map(c => {
      const serie = anteriores.map(m => ({ mes: m, v: d.porMes[m].clientes.get(c.key)?.faturamento ?? null }));
      const vals = serie.map(s => s.v).filter(v => !isBlank(v)).map(Number);
      const fat = isBlank(c.faturamento) ? null : Number(c.faturamento);
      const a = ant?.get(c.key);
      const fatAnt = isBlank(a?.faturamento) ? null : Number(a.faturamento);
      const ult3 = serie.slice(-4, -1).map(s => s.v).filter(v => !isBlank(v)).map(Number);
      const espaco = d.espacos[c.key]?.espaco || '';
      const meta = metaDe(espaco);
      const r = {
        ...c, fat, fatAnt, serie, espaco, meta,
        novo: !!ant && !a,
        var: fat !== null && fatAnt ? (fat / fatAnt - 1) * 100 : null,
        media3: ult3.length ? media(ult3) : null,
        cv: cv(vals),
        pctMeta: meta && fat !== null ? fat / meta * 100 : null,
        ticket: fat && Number(c.pedidos) ? fat / Number(c.pedidos) : null,
        taxaErro: Number(c.pedidos) ? c.erros / Number(c.pedidos) * 100 : null,
      };
      r.varMedia = fat !== null && r.media3 ? (fat / r.media3 - 1) * 100 : null;
      // sem número na planilha (ex.: aba do mês ainda sendo preenchida, ou contrato só com mensalidade)
      r.semDado = fat === null && isBlank(c.pedidos);
      r.semVendas = !r.semDado && !fat && !Number(c.pedidos);
      r.alertas = [];
      if (r.semDado) r.alertas.push('sem_dado');
      if (r.pctMeta !== null && r.pctMeta < 100) r.alertas.push('abaixo');
      if (r.var !== null && r.var <= REGRAS.quedaForte) r.alertas.push('queda');
      if (r.semVendas && !r.novo) r.alertas.push('sem_vendas');
      if (r.taxaErro !== null && r.taxaErro > REGRAS.erroMax) r.alertas.push('erro');
      r.reuniao = (r.var !== null && r.var <= REGRAS.reuniaoQueda) || (r.pctMeta !== null && r.pctMeta < REGRAS.reuniaoMeta)
        || (r.semVendas && !r.novo);
      return r;
    });
    const saiu = ant ? [...ant.values()].filter(c => !atual.has(c.key)) : [];
    return { ativos, saiu, anterior: i > 0 ? d.meses[i - 1] : null };
  }

  // ordem de contato do CS: menor volume primeiro (quem tem meta, pela distância da meta)
  function prioridade(lista) {
    const peso = c => c.pctMeta !== null ? c.pctMeta / 100 * 8000 : (c.fat ?? Infinity);
    return lista.slice().sort((a, b) => peso(a) - peso(b) || String(a.cliente).localeCompare(String(b.cliente)));
  }

  // dias em que o CS analisa o faturamento: 1º dia útil a partir do dia 3 (fecham dia 02) e do dia 16 (fecham dia 15)
  function diaDeAnalise(iso) {
    const d = dates.toDate(iso), dow = d.getDay();
    if (dow === 0 || dow === 6) return null;
    for (const [inicio, fecha] of [[3, 2], [16, 15]]) {
      let x = dates.toDate(`${iso.slice(0, 8)}${String(inicio).padStart(2, '0')}`);
      while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
      if (dates.toISO(x) === iso) return fecha;
    }
    return null;
  }

  const ALERTAS = {
    abaixo: { txt: 'Abaixo da meta', cls: 'warn' },
    queda: { txt: 'Queda forte', cls: 'down' },
    sem_vendas: { txt: 'Sem vendas', cls: 'down' },
    erro: { txt: 'Erro acima de 1%', cls: 'warn' },
    sem_dado: { txt: 'Sem dado na planilha', cls: 'neutral' },
  };

  return { ESPACOS, REGRAS, chave, metaDe, espacoTxt, errosObs, carregar, clientes, prioridade, diaDeAnalise, ALERTAS };
})();
