// Helpers dos dashboards (Chart.js + filtros + KPIs).
const Dash = (() => {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const charts = {};

  const HUB_COLORS = () => Object.fromEntries(HUBS.map((h, i) => [h, css(`--series-${(i % 4) + 1}`)]));

  if (window.Chart) { Chart.defaults.font.family = "'Poppins', system-ui, sans-serif"; Chart.defaults.font.size = 12; }

  function bar(id, { labels, datasets, horizontal = false, money = false, stacked = false, suffix = '', afterLabel = null }) {
    charts[id]?.destroy();
    const ctx = document.getElementById(id);
    const tick = v => money ? fmt.moneyShort(v) : fmt.num(v) + suffix;
    const single = datasets.length === 1;
    charts[id] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map(d => ({
          backgroundColor: d.color || css('--chart-brand'),
          borderRadius: 6,
          borderSkipped: 'start',
          borderColor: css('--surface'),
          borderWidth: stacked ? { top: 2 } : 0,
          maxBarThickness: 36,
          ...d,
        })),
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { mode: single ? 'nearest' : 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
        plugins: {
          legend: { display: !single, position: 'bottom', labels: { color: css('--text-2'), boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } },
          tooltip: {
            backgroundColor: css('--surface'), titleColor: css('--text'), bodyColor: css('--text-2'),
            borderColor: css('--border'), borderWidth: 1, padding: 10,
            callbacks: {
              label: c => `${single ? '' : c.dataset.label + ': '}${money ? fmt.money(c.parsed[horizontal ? 'x' : 'y']) : fmt.num(c.parsed[horizontal ? 'x' : 'y']) + suffix}`,
              ...(afterLabel ? { afterLabel: c => afterLabel(c.parsed[horizontal ? 'x' : 'y'], c) } : {}),
            },
          },
        },
        scales: {
          [horizontal ? 'y' : 'x']: { stacked, grid: { display: false }, border: { color: css('--axis') }, ticks: { color: css('--muted') } },
          [horizontal ? 'x' : 'y']: {
            stacked, beginAtZero: true, border: { display: false }, grid: { color: css('--grid') },
            ticks: { color: css('--muted'), callback: tick, precision: money ? undefined : 0 },
          },
        },
      },
    });
  }

  // Filtro de período: retorna {from, to} em AAAA-MM
  function periodRange(value, allMonths) {
    const to = dates.today().slice(0, 7);
    const back = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (n - 1)); return dates.toISO(d).slice(0, 7); };
    switch (value) {
      case 'mes': return { from: to, to };
      case '3': return { from: back(3), to };
      case '6': return { from: back(6), to };
      case '12': return { from: back(12), to };
      case 'ano': return { from: `${to.slice(0, 4)}-01`, to };
      default: {
        const valid = allMonths.filter(Boolean).sort();
        return valid.length ? { from: valid[0], to: valid[valid.length - 1] > to ? valid[valid.length - 1] : to } : { from: to, to };
      }
    }
  }

  function filtersHTML() {
    return `
      <select class="input" id="f-hub"><option value="">Todos os hubs</option>${HUBS.map(h => `<option>${esc(h)}</option>`).join('')}</select>
      <select class="input" id="f-periodo">
        <option value="mes">Mês atual</option><option value="3">Últimos 3 meses</option>
        <option value="6">Últimos 6 meses</option><option value="12" selected>Últimos 12 meses</option>
        <option value="ano">Este ano</option><option value="tudo">Todo o período</option>
      </select>
      <span class="spacer"></span>
      <span class="muted small" id="f-info"></span>`;
  }

  function kpis(el, items) {
    $(el).innerHTML = items.map(k => `
      <div class="card kpi"><div class="label">${esc(k.label)}</div>
      <div class="value">${k.value}</div>${k.sub ? `<div class="sub">${k.sub}</div>` : ''}</div>`).join('');
  }

  const sum = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const avg = (arr, k) => { const v = arr.map(r => r[k]).filter(x => !isBlank(x)).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const countBy = (arr, fn) => arr.reduce((m, r) => { const k = fn(r); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
  const sumBy = (arr, fn, key) => arr.reduce((m, r) => { const k = fn(r); if (k) m[k] = (m[k] || 0) + (Number(r[key]) || 0); return m; }, {});

  function onThemeChange(cb) { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', cb); }

  return { bar, periodRange, filtersHTML, kpis, sum, avg, countBy, sumBy, onThemeChange, HUB_COLORS, css };
})();
