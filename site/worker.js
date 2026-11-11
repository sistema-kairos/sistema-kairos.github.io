// Gerado a partir de worker-src.js + blog-texto.js (formatação dos posts). Não edite aqui.
const window = {};
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

// Worker do oriondelivery.com.br: entrega o site (arquivos em ./public) e monta o blog já pronto para o Google.
//   /blog              lista dos posts publicados (lida do Kairos/Supabase a cada visita)
//   /blog/<endereco>   o post completo, com título, descrição, imagem e dados estruturados
//   /blog?p=<endereco> endereço antigo: redireciona para /blog/<endereco>
//   /sitemap.xml       páginas fixas + todos os posts publicados, sempre atualizado
const SITE = 'https://oriondelivery.com.br';
const PAGINAS = [
  { loc: '/', prioridade: '1.0' },
  { loc: '/dark-kitchen', prioridade: '0.8' },
  { loc: '/blog', prioridade: '0.8' },
];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const urlOk = u => /^https:\/\/[^\s"'<>]+$/i.test(u || '');
const dataBR = iso => { try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }); } catch { return ''; } };
const html = (corpo, status = 200) => new Response(corpo, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' } });

async function rpc(env, nome, args = {}) {
  const r = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

async function modelo(env, req) {
  const r = await env.ASSETS.fetch(new Request(new URL('/blog', req.url), { headers: { accept: 'text/html' } }));
  if (!r.ok) throw new Error('modelo do blog indisponível');
  return r.text();
}

// troca os pedaços marcados do modelo (blog.html)
function montar(t, o) {
  const attr = (id, nome, v) => { t = t.replace(new RegExp(`(<[^>]*id="${id}"[^>]*\\s${nome}=")[^"]*(")`), `$1${esc(v)}$2`); };
  if (o.titulo) t = t.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(o.titulo)}</title>`);
  if (o.descricao) { attr('meta-desc', 'content', o.descricao); attr('og-desc', 'content', o.descricao); }
  if (o.url) { attr('canonical', 'href', o.url); attr('og-url', 'content', o.url); }
  if (o.ogTitulo) attr('og-title', 'content', o.ogTitulo);
  if (o.ogTipo) attr('og-type', 'content', o.ogTipo);
  if (o.imagem) attr('og-img', 'content', o.imagem);
  if (o.h1) t = t.replace(/(<h1 id="t-hero"[^>]*>)[\s\S]*?(<\/h1>)/, `$1${o.h1}$2`);
  if (o.apoio !== undefined) t = t.replace(/(<p class="apoio" id="apoio">)[\s\S]*?(<\/p>)/, `$1${o.apoio}$2`);
  if (o.kicker) t = t.replace(/(<p class="blog-kicker" id="kicker">)[\s\S]*?(<\/p>)/, `$1${o.kicker}$2`);
  if (o.post) t = t.replace('class="hero hero-blog"', 'class="hero hero-blog hero-post"');
  if (o.head) t = t.replace('<!--HEAD-->', o.head);
  if (o.corpo !== undefined) {
    t = t.replace(/<!--BLOG-->[\s\S]*?<!--\/BLOG-->/, o.corpo);
    t = t.replace('id="blog" aria-live="polite"', 'id="blog" aria-live="polite" data-ssr="1"');
  }
  return t;
}

function cardHTML(p) {
  const link = `/blog/${encodeURIComponent(p.slug)}`;
  return `<a class="blog-card rev on" href="${link}"><figure>${urlOk(p.capa) ? `<img src="${esc(p.capa)}" alt="" loading="lazy">`
    : '<span class="blog-sem-capa" aria-hidden="true"><svg viewBox="0 0 234 301"><use href="#logo" width="1046" height="301"/></svg></span>'}</figure>
    <div><span class="blog-data">${esc(dataBR(p.publicado_em))}</span><h2>${esc(p.titulo)}</h2>${p.resumo ? `<p>${esc(p.resumo)}</p>` : ''}
    <span class="ler">Ler post<svg class="ico" aria-hidden="true"><use href="#i-seta"/></svg></span></div></a>`;
}

async function paginaLista(req, env) {
  const [t, posts] = await Promise.all([modelo(env, req), rpc(env, 'blog_publico').catch(() => null)]);
  if (!posts) return html(t);   // sem banco: o navegador tenta carregar sozinho
  const corpo = posts.length ? `<div class="blog-grade">${posts.map(cardHTML).join('')}</div>`
    : '<div class="blog-vazio"><p>Os primeiros posts estão chegando. Volte em breve!</p></div>';
  const ld = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog da Órion', url: `${SITE}/blog`,
    blogPost: posts.slice(0, 20).map(p => ({ '@type': 'BlogPosting', headline: p.titulo, url: `${SITE}/blog/${p.slug}`, datePublished: p.publicado_em })) };
  return html(montar(t, { corpo, head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` }));
}

async function paginaPost(req, env, slug) {
  const [t, p] = await Promise.all([modelo(env, req), rpc(env, 'blog_post', { slug }).catch(() => undefined)]);
  if (p === undefined) return html(t);   // banco fora do ar: deixa o navegador tentar
  if (!p || !p.titulo) {
    return html(montar(t, { titulo: 'Post não encontrado | Blog da Órion', h1: 'Post <span class="mt">não encontrado</span>',
      apoio: 'Ele pode ter mudado de endereço ou saído do ar.', head: '<meta name="robots" content="noindex">',
      corpo: '<div class="blog-vazio"><p>Confira os outros posts do blog.</p><a class="bt bt-claro" href="/blog">Ver todos os posts</a></div>' }), 404);
  }
  const url = `${SITE}/blog/${encodeURIComponent(p.slug)}`;
  const imagem = urlOk(p.capa) ? p.capa : `${SITE}/og.jpg`;
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.titulo, description: p.resumo || undefined, image: imagem,
    datePublished: p.publicado_em, dateModified: p.atualizado_em || p.publicado_em,
    author: { '@type': p.autor ? 'Person' : 'Organization', name: p.autor || 'Órion' },
    publisher: { '@type': 'Organization', name: 'Órion', logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` } },
    mainEntityOfPage: url, inLanguage: 'pt-BR' };
  const corpo = `<article class="blog-post">${urlOk(p.capa) ? `<img class="blog-post-capa" src="${esc(p.capa)}" alt="${esc(p.titulo)}">` : ''}
    <div class="blog-texto">${window.textoBlog(p.texto)}</div><p class="blog-voltar"><a href="/blog">← Todos os posts</a></p></article>`;
  return html(montar(t, {
    titulo: `${p.titulo} | Blog da Órion`, descricao: p.resumo || p.titulo, url, ogTitulo: p.titulo, ogTipo: 'article', imagem,
    h1: esc(p.titulo), apoio: esc(p.resumo || ''), post: true,
    kicker: `<a href="/blog">Blog da Órion</a> · ${esc(dataBR(p.publicado_em))}${p.autor ? ' · ' + esc(p.autor) : ''}`,
    head: `<meta property="article:published_time" content="${esc(p.publicado_em)}"><script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    corpo,
  }));
}

async function sitemap(env) {
  let posts = [];
  try { posts = await rpc(env, 'blog_publico'); } catch {}
  const hoje = new Date().toISOString().slice(0, 10);
  const itens = [...PAGINAS.map(p => `<url><loc>${SITE}${p.loc}</loc><lastmod>${hoje}</lastmod><priority>${p.prioridade}</priority></url>`),
    ...posts.map(p => `<url><loc>${SITE}/blog/${esc(encodeURIComponent(p.slug))}</loc><lastmod>${esc(String(p.publicado_em).slice(0, 10))}</lastmod><priority>0.7</priority></url>`)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${itens.join('\n')}\n</urlset>\n`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const caminho = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (caminho === '/sitemap.xml') return await sitemap(env);
      if (caminho === '/blog' || caminho === '/blog.html') {
        const p = url.searchParams.get('p');
        if (p) return Response.redirect(`${SITE}/blog/${encodeURIComponent(p)}`, 301);
        if (caminho === '/blog.html') return Response.redirect(`${SITE}/blog`, 301);
        return await paginaLista(req, env);
      }
      const m = caminho.match(/^\/blog\/([^/]+)$/);
      if (m) return await paginaPost(req, env, decodeURIComponent(m[1]));
    } catch (e) {
      console.error(e);
    }
    return env.ASSETS.fetch(req);
  },
};
