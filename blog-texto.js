// Converte o texto do blog (formatação simples) em HTML seguro. Usado no Kairos (prévia) e no site.
//   ## Título   ### Subtítulo   - item   1. item   > citação   **negrito**   *itálico*   [texto](https://link)
//   ![descrição](https://imagem.jpg) numa linha sozinha vira imagem
//   [gráfico: Título] + linhas "Nome: valor" viram um gráfico de barras
window.textoBlog = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const urlOk = u => /^https?:\/\/[^\s"'<>]+$/i.test(u) || /^\/[^\s"'<>]*$/.test(u);
  function inline(t) {
    return esc(t)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, u) => urlOk(u) ? `<a href="${u}"${/^https?:/i.test(u) && !/oriondelivery\.com\.br/i.test(u) ? ' target="_blank" rel="noopener"' : ''}>${txt}</a>` : txt)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  }
  return function (texto) {
    const blocos = String(texto || '').replace(/\r/g, '').split(/\n{2,}/);
    return blocos.map(b => {
      const linhas = b.split('\n').filter(l => l.trim());
      if (!linhas.length) return '';
      const l0 = linhas[0].trim();
      if (linhas.length === 1) {
        let m;
        if ((m = l0.match(/^###\s+(.+)/))) return `<h3>${inline(m[1])}</h3>`;
        if ((m = l0.match(/^##\s+(.+)/))) return `<h2>${inline(m[1])}</h2>`;
        if ((m = l0.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)) && urlOk(m[2])) return `<figure><img src="${m[2]}" alt="${esc(m[1])}" loading="lazy">${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ''}</figure>`;
      }
      // gráfico de barras: [gráfico: Título] e depois uma linha por barra, "Nome: valor"
      const gm = l0.match(/^\[gr[aá]fico(?:\s*:\s*(.*?))?\]$/i);
      if (gm) {
        const barras = linhas.slice(1).map(l => l.match(/^\s*(.+?)\s*[:=]\s*(-?[\d.,]+)\s*(%|[a-zA-Z$]*)?\s*$/)).filter(Boolean)
          .map(m => ({ nome: m[1], txt: m[2] + (m[3] ? (m[3] === '%' ? '%' : ' ' + m[3]) : ''), v: parseFloat(m[2].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0 }));
        const max = Math.max(...barras.map(b => b.v), 0) || 1;
        return `<figure class="blog-grafico">${gm[1] ? `<figcaption>${inline(gm[1])}</figcaption>` : ''}<div class="bg-barras">${barras.map(b =>
          `<div class="bg-linha"><span class="bg-nome">${inline(b.nome)}</span><span class="bg-trilho"><i style="width:${Math.max(2, b.v / max * 100).toFixed(1)}%"></i></span><b>${esc(b.txt)}</b></div>`).join('')}</div></figure>`;
      }
      if (linhas.every(l => /^\s*[-*•]\s+/.test(l))) return `<ul>${linhas.map(l => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
      if (linhas.every(l => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${linhas.map(l => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
      if (linhas.every(l => /^\s*>/.test(l))) return `<blockquote>${linhas.map(l => inline(l.replace(/^\s*>\s?/, ''))).join('<br>')}</blockquote>`;
      return `<p>${linhas.map(inline).join('<br>')}</p>`;
    }).join('\n');
  };
})();
