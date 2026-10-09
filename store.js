// Camada de dados: usa Supabase (nuvem, compartilhado) quando configurado,
// ou localStorage (apenas neste navegador) caso contrário.
const Store = (() => {
  const LOCAL = 'gh_data_';
  const SESSION = 'gh_session';
  const OVERRIDE = 'gh_settings';
  const PERFIL = 'gh_perfil';

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }

  function settings() {
    const o = readJSON(OVERRIDE, {});
    // valores salvos neste navegador só valem se preenchidos; senão vale o config.js
    const pick = k => (o.supabaseUrl && o.supabaseAnonKey ? o[k] : window.APP_CONFIG[k]) || '';
    return {
      supabaseUrl: pick('supabaseUrl').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, ''),
      supabaseAnonKey: pick('supabaseAnonKey').trim(),
    };
  }
  function setSettings(s) {
    if (s === null) localStorage.removeItem(OVERRIDE);
    else localStorage.setItem(OVERRIDE, JSON.stringify(s));
  }
  const isRemote = () => { const s = settings(); return !!(s.supabaseUrl && s.supabaseAnonKey); };

  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  // ---------- sessão (Supabase Auth) ----------
  const getSession = () => readJSON(SESSION, null);
  const setSession = s => s ? localStorage.setItem(SESSION, JSON.stringify(s)) : localStorage.removeItem(SESSION);

  async function authRequest(grant, body) {
    const s = settings();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(s.supabaseUrl)) {
      throw new Error(`A URL do Supabase no config.js parece errada: "${s.supabaseUrl}". Ela deve ser no formato https://xxxx.supabase.co (Project Settings → Data API).`);
    }
    let r;
    try {
      r = await fetch(`${s.supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
        method: 'POST',
        headers: { apikey: s.supabaseAnonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Não foi possível conectar ao Supabase. Confira a URL no config.js e se o projeto não está pausado.');
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const raw = j.error_description || j.msg || j.message || j.error || '';
      const code = j.error_code || '';
      const TRAD = {
        invalid_credentials: 'E-mail ou senha incorretos.',
        email_not_confirmed: 'E-mail ainda não confirmado. No Supabase, crie o usuário com "Auto Confirm User" marcado.',
      };
      if (TRAD[code] || /invalid login credentials/i.test(raw)) throw new Error(TRAD[code] || TRAD.invalid_credentials);
      if (/api key/i.test(raw) || r.status === 401) throw new Error('Chave do Supabase inválida no config.js. Use a "anon public" ou a "Publishable key".');
      throw new Error(`Falha na autenticação (${r.status}${raw ? ': ' + raw : ''})`);
    }
    setSession({
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: Date.now() + j.expires_in * 1000,
      email: j.user?.email,
    });
  }
  const login = (email, password) => authRequest('password', { email, password });
  async function refresh() {
    const sess = getSession();
    if (!sess) throw new Error('Sessão expirada');
    try { await authRequest('refresh_token', { refresh_token: sess.refresh_token }); }
    catch (e) { setSession(null); location.href = 'login.html'; throw e; }
  }
  const logout = () => { setSession(null); localStorage.removeItem(PERFIL); };

  async function api(path, opts = {}, retry = true) {
    const s = settings();
    let sess = getSession();
    if (sess && sess.expires_at - Date.now() < 60_000) { await refresh(); sess = getSession(); }
    const r = await fetch(`${s.supabaseUrl}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: s.supabaseAnonKey,
        Authorization: `Bearer ${sess?.access_token || s.supabaseAnonKey}`,
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    });
    if (r.status === 401 && retry && sess) { await refresh(); return api(path, opts, false); }
    if (!r.ok) {
      const txt = await r.text();
      if (r.status === 403 || /row-level security|42501/.test(txt)) throw new Error('Você não tem permissão para alterar estes dados.');
      throw new Error(`Erro ${r.status}: ${txt}`);
    }
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }

  // ---------- local ----------
  const readLocal = t => readJSON(LOCAL + t, []);
  const writeLocal = (t, rows) => localStorage.setItem(LOCAL + t, JSON.stringify(rows));

  const strip = rec => { const d = { ...rec }; delete d.id; delete d.updated_at; return d; };
  const fromRow = r => ({ ...r.data, id: r.id, updated_at: r.updated_at });

  // ---------- API pública ----------
  async function list(table) {
    if (!isRemote()) return readLocal(table);
    const rows = await api(`registros?tabela=eq.${encodeURIComponent(table)}&select=id,data,updated_at&order=updated_at.desc`);
    return rows.map(fromRow);
  }

  async function get(table, id) {
    if (!isRemote()) return readLocal(table).find(r => r.id === id) || null;
    const rows = await api(`registros?tabela=eq.${encodeURIComponent(table)}&id=eq.${encodeURIComponent(id)}&select=id,data,updated_at`);
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async function saveMany(table, recs) {
    const now = new Date().toISOString();
    const out = recs.map(r => ({ ...strip(r), id: r.id || uid(), updated_at: now }));
    if (!isRemote()) {
      const all = readLocal(table);
      for (const row of out) {
        const i = all.findIndex(x => x.id === row.id);
        if (i >= 0) all[i] = row; else all.unshift(row);
      }
      writeLocal(table, all);
      return out;
    }
    for (let i = 0; i < out.length; i += 500) {
      await api('registros?on_conflict=tabela,id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(out.slice(i, i + 500).map(r => ({ tabela: table, id: r.id, data: strip(r), updated_at: now }))),
      });
    }
    return out;
  }
  const save = async (table, rec) => (await saveMany(table, [rec]))[0];

  async function remove(table, id) {
    if (!isRemote()) return writeLocal(table, readLocal(table).filter(r => r.id !== id));
    await api(`registros?tabela=eq.${encodeURIComponent(table)}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function clear(table) {
    if (!isRemote()) return localStorage.removeItem(LOCAL + table);
    await api(`registros?tabela=eq.${encodeURIComponent(table)}`, { method: 'DELETE' });
  }

  // ---------- permissões (espelham as regras do supabase-schema.sql) ----------
  // papel: Administrador | Utilizador | Espectador; area: Comercial | CS | MKT | Todas as áreas
  const AREA_DA_TABELA = { comercial: 'Comercial', crm: 'Comercial', cs: 'CS', leads: 'MKT', perfis: 'admin',
    ind_comercial: 'Comercial', ind_cs: 'CS', ind_mkt: 'MKT', visitas: 'MKT', margem: 'admin' };
  const areaDe = t => AREA_DA_TABELA[t] || 'geral';

  // sem Supabase (modo local) ou antes de ativar as permissões, todos são administradores
  function perfil() {
    if (!isRemote()) return { papel: 'Administrador', local: true };
    return readJSON(PERFIL, null) || { papel: 'Administrador', desconhecido: true };
  }
  async function carregarPerfil() {
    if (!isRemote() || !getSession()) return perfil();
    let p;
    try { p = await api('rpc/meu_perfil', { method: 'POST', body: '{}' }); }
    catch (e) {
      if (!/PGRST202|meu_perfil/.test(e.message)) throw e;
      p = { papel: 'Administrador', semPermissoes: true }; // SQL das permissões ainda não foi executado
    }
    localStorage.setItem(PERFIL, JSON.stringify(p || {}));
    return p;
  }
  const isAdmin = () => perfil().papel === 'Administrador';
  // a área aparece no menu para quem é dela (administradores e espectadores de todas as áreas veem tudo)
  function veArea(area) {
    const p = perfil();
    if (!area || p.papel === 'Administrador') return true;
    if (area === 'admin') return false;
    if (p.papel === 'Espectador' && (!p.area || p.area === 'Todas as áreas')) return true;
    return p.area === area;
  }
  function podeLer(t) {
    const p = perfil(), a = areaDe(t);
    if (p.papel === 'Administrador' || a === 'geral') return true;
    if (a === 'admin' || !p.papel) return false;
    if (p.papel === 'Espectador' && (!p.area || p.area === 'Todas as áreas')) return true;
    return p.area === a || (['Comercial', 'CS'].includes(p.area) && ['comercial', 'cs'].includes(t))
      || (p.area === 'MKT' && t === 'crm');   // Marketing consulta o CRM (leads por canal, vendas)
  }
  function podeEditar(t) {
    const p = perfil();
    if (p.papel === 'Administrador') return true;
    if (p.papel !== 'Utilizador') return false;
    return t === 'sprints' || p.area === areaDe(t); // Sprints: toda a equipe edita
  }

  // chama uma função do banco (Supabase RPC)
  const rpc = (nome, args = {}) => api(`rpc/${nome}`, { method: 'POST', body: JSON.stringify(args) });

  return { settings, setSettings, isRemote, getSession, login, logout, list, get, save, saveMany, remove, clear, uid, rpc,
    perfil, carregarPerfil, isAdmin, veArea, podeLer, podeEditar, areaDe };
})();
