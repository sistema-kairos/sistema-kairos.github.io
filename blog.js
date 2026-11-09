// Blog do site: posts de oriondelivery.com.br/blog (tabela 'blog', área MKT).
// O site lê os publicados pelas funções blog_publico / blog_post (supabase/blog.sql).
// Post: { id, titulo, slug, resumo, capa, autor, texto, status: 'Rascunho' | 'Publicado', publicado_em (ISO), criado_em, criado_por }
(() => {
  if (window.SEM_ACESSO) return;
  const SITE = 'https://oriondelivery.com.br';
  const canEdit = Store.podeEditar('blog');
  const eu = (() => { const p = Store.perfil(); return p.nome || (Store.getSession()?.email || '').split('@')[0] || 'Equipe Órion'; })();
  let posts = [];

  if (!canEdit) $('#novo').replaceWith(Object.assign(document.createElement('span'), { className: 'badge neutral', textContent: 'Somente visualização' }));

  const slugDe = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const agendado = p => p.status === 'Publicado' && p.publicado_em && new Date(p.publicado_em) > new Date();
  const situacao = p => p.status !== 'Publicado' ? 'Rascunho' : agendado(p) ? 'Agendado' : 'Publicado';
  const linkDe = p => `${SITE}/blog?p=${encodeURIComponent(p.slug)}`;
  const paraInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  async function load() {
    try { posts = await Store.list('blog'); }
    catch (e) { toast('Erro ao carregar o blog: ' + e.message, 'error'); posts = []; }
    render();
  }

  function render() {
    const q = norm($('#busca').value), st = $('#f-status').value;
    const lista = posts.filter(p => (!st || situacao(p) === st) && (!q || norm([p.titulo, p.resumo, p.autor].join(' ')).includes(q)))
      .sort((a, b) => (b.publicado_em || b.criado_em || '').localeCompare(a.publicado_em || a.criado_em || ''));
    const n = s => posts.filter(p => situacao(p) === s).length;
    $('#resumo').textContent = `${n('Publicado')} publicados · ${n('Agendado')} agendados · ${n('Rascunho')} rascunhos`;
    const badge = s => `<span class="badge ${s === 'Publicado' ? 'ok' : s === 'Agendado' ? 'lilac' : 'neutral'}">${s}</span>`;
    $('#tabela').innerHTML = lista.length ? `<table class="data"><thead><tr><th>Post</th><th>Status</th><th>Publicação</th><th>Autor</th><th></th></tr></thead><tbody>
      ${lista.map(p => `<tr data-id="${esc(p.id)}">
        <td style="white-space:normal"><b>${esc(p.titulo || 'Sem título')}</b><div class="muted small">${esc(p.resumo || '')}</div></td>
        <td>${badge(situacao(p))}</td>
        <td>${p.publicado_em ? esc(fmt.dateTime(p.publicado_em)) : '—'}</td>
        <td>${esc(p.autor || '—')}</td>
        <td>${situacao(p) === 'Publicado' ? `<a class="link-btn" href="${esc(linkDe(p))}" target="_blank" rel="noopener" data-link>Ver no site</a>` : ''}</td>
      </tr>`).join('')}</tbody></table>`
      : `<div class="lista-vazia" style="padding:28px;text-align:center" class="muted">${posts.length ? 'Nenhum post com esses filtros' : 'Nenhum post ainda. Clique em “+ Novo post”.'}</div>`;
    $$('tbody tr', $('#tabela')).forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('[data-link]')) editar(posts.find(p => p.id === tr.dataset.id)); }));
  }

  function editar(p = null) {
    const novo = !p;
    const base = p ? { ...p } : { id: Store.uid(), status: 'Rascunho', autor: eu, criado_em: new Date().toISOString(), criado_por: eu };
    const ro = canEdit ? '' : 'disabled';
    const dlg = openModal({
      title: novo ? 'Novo post' : 'Editar post',
      wide: true,
      body: `<form class="form-grid blog-form" novalidate>
        <label class="field wide"><span>Título *</span><input class="input" name="titulo" value="${esc(base.titulo || '')}" required maxlength="110" ${ro}
          placeholder="Ex.: 5 jeitos de vender mais no iFood sem abrir loja nova"></label>
        <label class="field wide"><span>Endereço do post</span><div class="blog-slug"><span class="muted small">oriondelivery.com.br/blog?p=</span>
          <input class="input" name="slug" value="${esc(base.slug || '')}" ${ro} placeholder="gerado a partir do título"></div></label>
        <label class="field wide"><span>Resumo (aparece no Google e na lista do blog) <b class="muted small" id="cont-resumo"></b></span>
          <textarea class="input" name="resumo" rows="2" maxlength="200" ${ro} placeholder="Uma ou duas frases sobre o post, até 160 caracteres">${esc(base.resumo || '')}</textarea></label>
        <label class="field"><span>Imagem de capa (link)</span><input class="input" name="capa" type="url" value="${esc(base.capa || '')}" ${ro} placeholder="https://…/imagem.jpg"></label>
        <label class="field"><span>Autor</span><input class="input" name="autor" value="${esc(base.autor || '')}" ${ro}></label>
        <div class="field wide"><span>Texto *</span>
          <div class="blog-dica muted small">Linha em branco separa parágrafos · <code>## Título</code> · <code>### Subtítulo</code> · <code>- item</code> · <code>**negrito**</code> · <code>[texto](https://link)</code> · <code>![legenda](https://imagem.jpg)</code></div>
          <div class="blog-editor"><textarea class="input mono" name="texto" rows="18" ${ro}>${esc(base.texto || '')}</textarea>
          <div class="blog-previa" aria-label="Prévia do post"></div></div></div>
        <label class="field"><span>Publicação</span><input class="input" type="datetime-local" name="publicado_em" value="${esc(paraInput(base.publicado_em))}" ${ro}>
          <span class="muted small">Vazio = agora. Data futura = agendado.</span></label>
        <div class="field"><span>Status</span><b>${esc(situacao(base))}</b></div>
      </form>`,
      actions: canEdit ? [
        ...(!novo ? [{ label: 'Excluir', cls: 'danger left', onClick: async () => {
          if (!confirm('Excluir este post? Se estiver publicado, sai do site na hora.')) return false;
          await Store.remove('blog', base.id); posts = posts.filter(x => x.id !== base.id); render(); toast('Post excluído');
        } }] : []),
        ...(base.status === 'Publicado' ? [{ label: 'Tirar do ar', cls: 'ghost', onClick: dl => salvar(dl, 'Rascunho') }] : []),
        { label: 'Salvar rascunho', cls: base.status === 'Publicado' ? 'hidden' : 'ghost', onClick: dl => salvar(dl, 'Rascunho') },
        { label: base.status === 'Publicado' ? 'Salvar alterações' : 'Publicar', cls: 'primary', onClick: dl => salvar(dl, 'Publicado') },
      ] : [{ label: 'Fechar', cls: 'ghost' }],
    });
    const f = $('form', dlg), prev = $('.blog-previa', dlg);
    let slugManual = !!base.slug;
    const atualizar = () => {
      prev.innerHTML = `${f.elements.capa.value ? `<img class="blog-capa" src="${esc(f.elements.capa.value)}" alt="">` : ''}
        <h1>${esc(f.elements.titulo.value || 'Título do post')}</h1>${textoBlog(f.elements.texto.value) || '<p class="muted">A prévia aparece aqui.</p>'}`;
      const n = f.elements.resumo.value.length;
      $('#cont-resumo', dlg).textContent = `${n}/160`;
    };
    f.elements.titulo.addEventListener('input', () => { if (!slugManual) f.elements.slug.value = slugDe(f.elements.titulo.value); atualizar(); });
    f.elements.slug.addEventListener('input', () => { slugManual = true; });
    f.elements.slug.addEventListener('change', () => { f.elements.slug.value = slugDe(f.elements.slug.value); });
    ['texto', 'capa', 'resumo'].forEach(k => f.elements[k].addEventListener('input', atualizar));
    atualizar();

    async function salvar(dl, status) {
      const v = k => f.elements[k].value.trim();
      const titulo = v('titulo'), texto = f.elements.texto.value.trim();
      const slug = slugDe(v('slug') || titulo);
      if (!titulo) { toast('Coloque um título'); return false; }
      if (status === 'Publicado' && !texto) { toast('Escreva o texto antes de publicar'); return false; }
      if (posts.some(x => x.id !== base.id && x.slug === slug)) { toast('Já existe um post com esse endereço. Mude o endereço.'); return false; }
      const quando = v('publicado_em') ? new Date(v('publicado_em')).toISOString() : null;
      const rec = { ...base, titulo, slug, resumo: v('resumo') || null, capa: v('capa') || null, autor: v('autor') || null, texto, status,
        publicado_em: status === 'Publicado' ? (quando || base.publicado_em || new Date().toISOString()) : quando };
      const [salvo] = await Store.saveMany('blog', [rec]);
      posts = [salvo, ...posts.filter(x => x.id !== salvo.id)];
      render();
      if (status !== 'Publicado') return toast(base.status === 'Publicado' ? 'Post tirado do ar' : 'Rascunho salvo', 'ok');
      if (agendado(salvo)) return toast(`Post agendado para ${fmt.dateTime(salvo.publicado_em)}`, 'ok');
      openModal({
        title: 'Post no ar!',
        body: `<p><b>${esc(titulo)}</b> já está em <a href="${esc(linkDe(salvo))}" target="_blank" rel="noopener">${esc(linkDe(salvo).replace('https://', ''))}</a>.</p>
          <p>Para o Google achar mais rápido: no Search Console, em <b>Inspeção de URL</b>, cole o link acima e clique em <b>Solicitar indexação</b>.</p>`,
        actions: [{ label: 'Copiar link', cls: 'ghost', onClick: async () => { try { await navigator.clipboard.writeText(linkDe(salvo)); toast('Link copiado', 'ok'); } catch {} return false; } },
          { label: 'Fechar', cls: 'primary' }],
      });
    }
  }

  $('#novo')?.addEventListener('click', () => editar());
  ['busca', 'f-status'].forEach(id => $('#' + id).addEventListener(id === 'busca' ? 'input' : 'change', render));
  load().then(() => { const id = new URLSearchParams(location.search).get('id'); const p = posts.find(x => x.id === id); if (p) editar(p); });
})();
