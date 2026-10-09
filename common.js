// Utilitários compartilhados + layout (menu lateral) + proteção de login.
const HUBS = window.APP_CONFIG.hubs;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isBlank = v => v === null || v === undefined || v === '';
// Modelo DK: taxa variável cobrada em valor fixo (R$), nunca em %
const isDK = modelo => norm(modelo).startsWith('dk');

// ---------- formatação ----------
const fmt = {
  money: v => isBlank(v) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  moneyShort: v => {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (Math.abs(n) >= 1e4) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return fmt.money(n);
  },
  num: (v, d = 1) => isBlank(v) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }),
  pct: v => isBlank(v) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%',
  date: iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—',
  month: ym => ym ? `${MESES[+ym.slice(5, 7) - 1]}/${ym.slice(0, 4)}` : '—',
  dateTime: iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—',
  ago: iso => {
    if (!iso) return 'nunca';
    const s = Math.round((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return `há ${s}s`;
    if (s < 3600) return `há ${Math.round(s / 60)} min`;
    if (s < 86400) return `há ${Math.round(s / 3600)} h`;
    return `há ${Math.round(s / 86400)} dias`;
  },
};

// ---------- conversão de valores vindos de planilhas ----------
const parse = {
  num(v) {
    if (isBlank(v)) return null;
    if (typeof v === 'number') return v;
    let s = String(v).replace(/R\$|%|\s/g, '');
    if (!s || s === '-') return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 3.000 / 1.250.000 = milhar
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  },
  date(v) {
    if (isBlank(v)) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    return null;
  },
  month(v) {
    if (isBlank(v)) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // data completa dd/mm/aaaa
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/.-](\d{2,4})$/);
    if (m) return `${m[2].length === 2 ? '20' + m[2] : m[2]}-${m[1].padStart(2, '0')}`;
    m = norm(s).match(/^([a-z]+)(\d{2,4})?$/);
    if (m) {
      const i = MESES_LONGOS.findIndex(n => n.startsWith(m[1].slice(0, 3)));
      if (i >= 0) {
        const y = m[2] ? (m[2].length === 2 ? '20' + m[2] : m[2]) : String(new Date().getFullYear());
        return `${y}-${String(i + 1).padStart(2, '0')}`;
      }
    }
    return null;
  },
};

// ---------- datas (sempre strings AAAA-MM-DD) ----------
const dates = {
  toDate: iso => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); },
  toISO: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  today: () => dates.toISO(new Date()),
  addDays: (iso, n) => { const d = dates.toDate(iso); d.setDate(d.getDate() + n); return dates.toISO(d); },
  diffDays: (a, b) => Math.round((dates.toDate(b) - dates.toDate(a)) / 86400000),
  monthsBetween: (a, b) => Math.round((dates.diffDays(a, b) / 30.4375) * 10) / 10,
  ym: iso => iso ? iso.slice(0, 7) : null,
  monthRange(from, to) {
    const out = [];
    let [y, m] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      if (++m > 12) { m = 1; y++; }
    }
    return out;
  },
};

// ---------- feedback ----------
function toast(msg, type = 'info') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? 7000 : 3500);
}

// Abre um <dialog>. actions: [{label, cls, onClick(dialog) -> false mantém aberto}]
function openModal({ title, body, actions = [], wide = false }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (wide ? ' wide' : '');
  dlg.innerHTML = `
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fechar">×</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot"></div>`;
  const foot = $('.modal-foot', dlg);
  actions.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { if ((await a.onClick?.(dlg)) !== false) dlg.close(); }
      catch (e) { toast(e.message, 'error'); }
      finally { b.disabled = false; }
    });
    foot.appendChild(b);
  });
  $('[data-close]', dlg).addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  return dlg;
}

// ---------- layout ----------
// area: quem vê o grupo no menu (ver Store.veArea); 'admin' = só administradores
const NAV = [
  { group: null, items: [
    { page: 'inicio', href: 'index.html', label: 'Início' },
    { page: 'sprints', href: 'sprints.html', label: 'Sprints' },
  ] },
  { group: 'Comercial', area: 'Comercial', items: [
    { page: 'crm', href: 'crm.html', label: 'CRM' },
    { page: 'comercial', href: 'comercial.html', label: 'Clientes' },
    { page: 'dash-comercial', href: 'dashboard-comercial.html', label: 'Dashboard Comercial' },
    { page: 'ind-comercial', href: 'indicadores.html?area=comercial', label: 'Indicadores' },
  ] },
  { group: 'CS', area: 'CS', items: [
    { page: 'cs', href: 'cs.html', label: 'Solicitações de saída' },
    { page: 'dash-cs', href: 'dashboard-cs.html', label: 'Dashboard CS' },
    { page: 'ind-cs', href: 'indicadores.html?area=cs', label: 'Indicadores' },
  ] },
  { group: 'MKT', area: 'MKT', items: [
    { page: 'leads', href: 'leads.html', label: 'Leads do formulário' },
    { page: 'dash-mkt', href: 'dashboard-mkt.html', label: 'Dashboard MKT' },
    { page: 'ind-mkt', href: 'indicadores.html?area=mkt', label: 'Indicadores' },
  ] },
  { group: 'Sistema', items: [
    { page: 'margem', href: 'margem.html', label: 'Calculadora de margem', area: 'admin' },
    { page: 'sistemas', href: 'sistemas.html', label: 'Status dos Sistemas', area: 'admin' },
    { page: 'permissoes', href: 'permissoes.html', label: 'Permissões', area: 'admin' },
    { page: 'config', href: 'configuracoes.html', label: 'Configurações', area: 'admin' },
  ] },
];
const navArea = page => { for (const g of NAV) { const i = g.items.find(x => x.page === page); if (i) return i.area || g.area; } return null; };

function perfilTexto(p) {
  if (!p.papel) return 'Sem perfil de acesso';
  if (p.papel === 'Utilizador') return `Utilizador · ${p.area || '—'}`;
  if (p.papel === 'Espectador') return `Espectador · ${!p.area || p.area === 'Todas as áreas' ? 'todas as áreas' : p.area}`;
  return 'Administrador';
}

function renderLayout() {
  const page = document.body.dataset.page;
  if (page === 'login') return;
  if (Store.isRemote() && !Store.getSession()) { location.href = 'login.html'; return; }

  const sess = Store.getSession();
  const p = Store.perfil();
  const semPerfil = Store.isRemote() && !p.papel;
  const groups = NAV.map(g => ({ ...g, items: g.items.filter(i => !semPerfil && Store.veArea(i.area || g.area)) })).filter(g => g.items.length);
  let menuAberto = {};
  try { menuAberto = JSON.parse(localStorage.getItem('gh_menu')) || {}; } catch {}
  const side = document.createElement('aside');
  side.className = 'sidebar';
  side.innerHTML = `
    <a class="brand" href="index.html"><span class="brand-logo logo-mark logo-wordmark" role="img" aria-label="Órion"></span><span class="brand-sub">${esc(window.APP_CONFIG.appName)}</span></a>
    <nav>${groups.map((g, gi) => {
      const links = g.items.map(i => `<a href="${i.href}" class="${i.page === page ? 'active' : ''}">${i.label}</a>`).join('');
      if (!g.group) return links;
      // grupo retrátil: o da página atual abre sempre; os demais seguem a última escolha (fechados por padrão)
      const aberto = g.items.some(i => i.page === page) || menuAberto[g.group] === true;
      return `<button type="button" class="nav-group ${aberto ? '' : 'fechado'}" data-grupo="${esc(g.group)}" aria-expanded="${aberto}" aria-controls="nav-g${gi}">
          <span>${g.group}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <div class="nav-items ${aberto ? '' : 'fechado'}" id="nav-g${gi}"><div>${links}</div></div>`;
    }).join('')}</nav>
    <div class="side-foot">
      ${Store.isRemote()
        ? `<div class="muted small">${esc(sess?.email || '')}</div><div class="badge ${p.papel === 'Espectador' ? 'neutral' : 'lilac'}">${esc(perfilTexto(p))}</div><button class="btn ghost small" id="logout">Sair</button>`
        : `<div class="badge warn" title="Configure o Supabase em Configurações para compartilhar os dados">Modo local</div>`}
    </div>`;
  document.body.prepend(side);
  $$('.nav-group[data-grupo]', side).forEach(b => b.addEventListener('click', () => {
    const abrir = b.classList.contains('fechado');
    b.classList.toggle('fechado', !abrir);
    b.setAttribute('aria-expanded', abrir);
    $('#' + b.getAttribute('aria-controls')).classList.toggle('fechado', !abrir);
    menuAberto[b.dataset.grupo] = abrir;
    try { localStorage.setItem('gh_menu', JSON.stringify(menuAberto)); } catch {}
  }));

  const top = document.createElement('header');
  top.className = 'topbar';
  top.innerHTML = `<button class="icon-btn" id="menu-toggle" aria-label="Menu">☰</button><span class="brand-logo logo-mark logo-wordmark" role="img" aria-label="Órion"></span>`;
  document.body.prepend(top);
  $('#menu-toggle').addEventListener('click', () => document.body.classList.toggle('menu-open'));
  $('#logout')?.addEventListener('click', () => { Store.logout(); location.href = 'login.html'; });

  // página fora das áreas do usuário: mostra aviso no lugar do conteúdo
  const main = $('main.content');
  if (main && (semPerfil || !Store.veArea(navArea(page)))) {
    main.innerHTML = `<div class="card no-access"><h2>Sem acesso a esta página</h2><p class="muted">${semPerfil
      ? 'Seu usuário ainda não tem um perfil de acesso. Peça a um administrador para liberar em <b>Sistema → Permissões</b>.'
      : 'Esta área não faz parte do seu perfil de acesso. Se precisar dela, fale com um administrador.'}</p>
      ${semPerfil ? '' : '<a class="btn primary" href="index.html">Voltar ao início</a>'}</div>`;
    window.SEM_ACESSO = true;
  }

  // confere o perfil no servidor; se mudou desde o último acesso, recarrega com o menu certo
  if (Store.isRemote()) {
    const antes = JSON.stringify(p);
    Store.carregarPerfil().then(n => { if (JSON.stringify(n) !== antes) location.reload(); }).catch(() => {});
  }
}
renderLayout();
