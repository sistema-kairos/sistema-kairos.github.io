// Converte o texto do blog (formatação simples) em HTML seguro. Usado no Kairos (prévia) e no site.
//   ## Título   ### Subtítulo   - item   1. item   > citação   **negrito**   *itálico*   [texto](https://link)
//   ![descrição](https://imagem.jpg) numa linha sozinha vira imagem
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
      if (linhas.every(l => /^\s*[-*•]\s+/.test(l))) return `<ul>${linhas.map(l => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
      if (linhas.every(l => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${linhas.map(l => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
      if (linhas.every(l => /^\s*>/.test(l))) return `<blockquote>${linhas.map(l => inline(l.replace(/^\s*>\s?/, ''))).join('<br>')}</blockquote>`;
      return `<p>${linhas.map(inline).join('<br>')}</p>`;
    }).join('\n');
  };
})();
