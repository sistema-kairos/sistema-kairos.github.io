// Monitoramento: configuração dos serviços e verificação de status.
//
// Modos de verificação:
//   manual    – alguém marca Aberto/Fechado (ou Operando/Fora) na tela; o status fica salvo e compartilhado
//   http      – faz uma requisição à URL; resposta 2xx = operando (a URL precisa permitir CORS)
//   alcance   – só verifica se a URL responde (modo no-cors; não lê o conteúdo, funciona com qualquer site)
//   json      – lê um campo de uma resposta JSON e compara com o valor esperado (ex.: campo "aberto" = true)
//   heartbeat – o sistema externo envia um "sinal de vida" periodicamente; se passar de X minutos sem sinal = fora
//   teste     – teste diário do formulário de leads, feito pelo próprio banco às 9h (ver supabase-schema.sql);
//               o resultado fica em heartbeat/formulario = { at, ok, etapas: { pagina, config, envio }, ultimo_ok }
const Monitor = (() => {
  const FORMULARIO = { id: 'formulario', nome: 'Formulário de leads', grupo: 'Formulário', modo: 'teste', url: '', campo: '', esperado: '', heartbeatMin: 26 * 60 };
  const DEFAULT = {
    intervalo: 60,
    servicos: [
      ...HUBS.map(h => ({ id: 'hub_' + norm(h), nome: 'HUB ' + h, grupo: 'Hubs', modo: 'manual', url: '', campo: '', esperado: '', heartbeatMin: 10 })),
      { id: 'chatpro', nome: 'ChatPro', grupo: 'Integrações', modo: 'manual', url: '', campo: '', esperado: '', heartbeatMin: 10 },
      { id: 'push_pedidos', nome: 'Push de pedidos', grupo: 'Integrações', modo: 'heartbeat', url: '', campo: '', esperado: '', heartbeatMin: 15 },
      FORMULARIO,
    ],
  };
  const MODOS = { manual: 'Manual', http: 'HTTP (CORS)', alcance: 'Alcance (no-cors)', json: 'Campo JSON', heartbeat: 'Heartbeat', teste: 'Teste diário 9h' };

  async function loadConfig() {
    const c = await Store.get('config', 'monitor').catch(() => null);
    if (!c) return structuredClone(DEFAULT);
    const servicos = c.servicos?.length ? c.servicos : structuredClone(DEFAULT.servicos);
    // o teste do formulário é fixo do sistema: aparece mesmo em configurações salvas antes dele existir
    if (!servicos.some(s => s.id === FORMULARIO.id)) servicos.push(structuredClone(FORMULARIO));
    return { intervalo: c.intervalo || DEFAULT.intervalo, servicos };
  }
  const saveConfig = cfg => Store.save('config', { id: 'monitor', ...cfg });

  const labels = svc => svc.grupo === 'Hubs'
    ? { ok: 'Aberto', down: 'Fechado', unknown: 'Sem informação' }
    : { ok: 'Operando', down: 'Fora do ar', unknown: 'Sem informação' };

  async function timedFetch(url, opts = {}, ms = 10000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const start = performance.now();
    try {
      const r = await fetch(url, { cache: 'no-store', ...opts, signal: ctrl.signal });
      return { r, ms: Math.round(performance.now() - start) };
    } finally { clearTimeout(t); }
  }

  const getPath = (obj, path) => path.split('.').filter(Boolean).reduce((o, k) => o?.[k], obj);

  // status: 'ok' | 'down' | 'unknown'
  async function check(svc, manual, heartbeat) {
    const em = new Date().toISOString();
    try {
      switch (svc.modo) {
        case 'manual':
          if (!manual) return { status: 'unknown', detalhe: 'Nenhum status registrado ainda', em };
          return { status: manual.status, detalhe: manual.nota || `Atualizado manualmente${manual.por ? ' por ' + manual.por : ''}`, em: manual.updated_at, manual: true };
        case 'heartbeat': {
          const at = heartbeat?.at || heartbeat?.updated_at;
          if (!at) return { status: 'unknown', detalhe: 'Nenhum sinal recebido ainda', em };
          const ok = (Date.now() - new Date(at)) / 60000 <= (svc.heartbeatMin || 10);
          return { status: ok ? 'ok' : 'down', detalhe: `Último sinal ${fmt.ago(at)} (${fmt.dateTime(at)})`, em };
        }
        case 'teste': {
          if (!heartbeat?.at) return { status: 'unknown', detalhe: 'O primeiro teste roda às 9h', em };
          const NOMES = { pagina: 'Página', config: 'Configuração', envio: 'Envio' };
          const etapas = Object.entries(NOMES).map(([k, n]) => ({ n, ...(heartbeat.etapas?.[k] || { ok: false, detalhe: 'sem resultado' }) }));
          const atrasado = (Date.now() - new Date(heartbeat.at)) / 60000 > (svc.heartbeatMin || 26 * 60);
          const quando = `Teste de ${fmt.dateTime(heartbeat.at)}`;
          if (atrasado) return { status: 'down', detalhe: `O teste diário não rodou desde ${fmt.dateTime(heartbeat.at)}`, em: heartbeat.at };
          if (!heartbeat.ok) return { status: 'down', em: heartbeat.at,
            detalhe: `${quando}: ${etapas.filter(e => !e.ok).map(e => e.detalhe).join(' · ')}${heartbeat.ultimo_ok ? ` · último teste ok: ${fmt.dateTime(heartbeat.ultimo_ok)}` : ''}` };
          return { status: 'ok', detalhe: `${quando}: ${etapas.map(e => e.n + ' ok').join(' · ')}`, em: heartbeat.at };
        }
        case 'alcance': {
          if (!svc.url) return { status: 'unknown', detalhe: 'URL não configurada', em };
          const { ms } = await timedFetch(svc.url, { mode: 'no-cors' });
          return { status: 'ok', detalhe: `Respondeu em ${ms} ms`, em, ms };
        }
        case 'http': case 'json': {
          if (!svc.url) return { status: 'unknown', detalhe: 'URL não configurada', em };
          const { r, ms } = await timedFetch(svc.url);
          if (!r.ok) return { status: 'down', detalhe: `HTTP ${r.status} em ${ms} ms`, em, ms };
          if (svc.modo === 'http') return { status: 'ok', detalhe: `HTTP ${r.status} em ${ms} ms`, em, ms };
          const v = getPath(await r.json(), svc.campo || '');
          const ok = norm(v) === norm(svc.esperado);
          return { status: ok ? 'ok' : 'down', detalhe: `${svc.campo} = ${JSON.stringify(v)} (${ms} ms)`, em, ms };
        }
        default:
          return { status: 'unknown', detalhe: 'Modo desconhecido', em };
      }
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Sem resposta em 10s' : 'Falha de conexão (servidor fora ou bloqueado por CORS)';
      return { status: 'down', detalhe: msg, em };
    }
  }

  return { DEFAULT, MODOS, loadConfig, saveConfig, labels, check };
})();
