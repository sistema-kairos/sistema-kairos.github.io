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
  const linkDe = p => `${SITE}/blog/${encodeURIComponent(p.slug)}`;
  const paraInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  // ---------- imagens: reduz no navegador e envia para o Storage do Supabase (bucket público 'blog') ----------
  const BUCKET = 'blog';
  async function enviarImagem(file, largura = 1600) {
    if (!file || !/^image\//.test(file.type)) throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).');
    if (!Store.isRemote()) throw new Error('O envio de imagens só funciona com o Supabase configurado.');
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch { throw new Error('Não consegui abrir essa imagem. Se for foto do iPhone (HEIC), salve como JPG antes.'); }
    const k = Math.min(1, largura / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const png = file.type === 'image/png' && c.width <= 900;   // ícones e gráficos pequenos ficam nítidos em PNG
    let blob = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/webp', .85));
    if (!blob || (!png && blob.type !== 'image/webp')) blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .85));
    if (blob.size > 5 * 1024 * 1024) throw new Error('A imagem ficou grande demais (mais de 5 MB). Tente uma menor.');
    const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[blob.type] || 'jpg';
    await Store.rpc('meu_perfil').catch(() => {});   // renova a sessão antes do envio
    const st = Store.settings(), sess = Store.getSession();
    const nome = `${new Date().toISOString().slice(0, 7)}/${Store.uid()}.${ext}`;
    const r = await fetch(`${st.supabaseUrl}/storage/v1/object/${BUCKET}/${nome}`, {
      method: 'POST', body: blob,
      headers: { apikey: st.supabaseAnonKey, Authorization: `Bearer ${sess?.access_token || st.supabaseAnonKey}`, 'Content-Type': blob.type, 'cache-control': '31536000' },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (/bucket not found/i.test(t)) throw new Error('O espaço de imagens ainda não foi criado no Supabase (rode o supabase/blog.sql de novo).');
      if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error('Sem permissão para enviar imagens. Só quem é de MKT ou administrador pode.');
      throw new Error(`Falha ao enviar a imagem (${r.status}).`);
    }
    return `${st.supabaseUrl}/storage/v1/object/public/${BUCKET}/${nome}`;
  }
  function escolherArquivo() {
    return new Promise(res => {
      const i = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
      i.addEventListener('change', () => res(i.files[0] || null));
      i.click();
    });
  }

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
        <label class="field wide"><span>Endereço do post</span><div class="blog-slug"><span class="muted small">oriondelivery.com.br/blog/</span>
          <input class="input" name="slug" value="${esc(base.slug || '')}" ${ro} placeholder="gerado a partir do título"></div></label>
        <label class="field wide"><span>Resumo (aparece no Google e na lista do blog) <b class="muted small" id="cont-resumo"></b></span>
          <textarea class="input" name="resumo" rows="2" maxlength="200" ${ro} placeholder="Uma ou duas frases sobre o post, até 160 caracteres">${esc(base.resumo || '')}</textarea></label>
        <div class="field"><span>Imagem de capa</span>
          <div class="blog-capa-campo">${canEdit ? '<button type="button" class="btn small" id="enviar-capa">Enviar foto</button>' : ''}
            <input class="input" name="capa" type="url" value="${esc(base.capa || '')}" ${ro} placeholder="ou cole o link da imagem"></div>
          <span class="muted small" id="capa-status">Ideal: foto deitada (16:9), até 5 MB.</span></div>
        <label class="field"><span>Autor</span><input class="input" name="autor" value="${esc(base.autor || '')}" ${ro}></label>
        <div class="field wide"><span>Texto *</span>
          ${canEdit ? `<div class="blog-ferramentas"><button type="button" class="btn small" id="ins-imagem">+ Imagem</button>
            <button type="button" class="btn small" id="ins-grafico">+ Gráfico</button>
            <span class="muted small" id="texto-status">Você também pode arrastar ou colar (Ctrl+V) uma imagem no texto.</span></div>` : ''}
          <div class="blog-dica muted small">Linha em branco separa parágrafos · <code>## Título</code> · <code>### Subtítulo</code> · <code>- item</code> · <code>**negrito**</code> · <code>[texto](https://link)</code> · <code>![legenda](imagem)</code> · <code>[gráfico: Título]</code></div>
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

    // capa: envia a foto e preenche o link
    $('#enviar-capa', dlg)?.addEventListener('click', async e => {
      const file = await escolherArquivo(); if (!file) return;
      const b = e.target, st = $('#capa-status', dlg);
      b.disabled = true; st.textContent = 'Enviando foto…';
      try { f.elements.capa.value = await enviarImagem(file, 1600); st.textContent = 'Foto enviada.'; atualizar(); }
      catch (err) { st.textContent = err.message; toast(err.message, 'error'); }
      finally { b.disabled = false; }
    });
    // imagens e gráficos no texto
    const ta = f.elements.texto;
    function inserir(trecho) {
      const i = ta.selectionStart ?? ta.value.length, antes = ta.value.slice(0, i), depois = ta.value.slice(ta.selectionEnd ?? i);
      const pre = antes && !/\n\n$/.test(antes) ? (antes.endsWith('\n') ? '\n' : '\n\n') : '';
      const pos = depois && !/^\n\n/.test(depois) ? (depois.startsWith('\n') ? '\n' : '\n\n') : '';
      ta.value = antes + pre + trecho + pos + depois;
      const fim = (antes + pre + trecho).length;
      ta.focus(); ta.setSelectionRange(fim, fim);
      atualizar();
    }
    async function imagensNoTexto(files) {
      const st = $('#texto-status', dlg);
      for (const file of files) {
        if (!/^image\//.test(file.type)) continue;
        st.textContent = 'Enviando imagem…';
        try { const url = await enviarImagem(file, 1400); inserir(`![${(file.name || 'Imagem').replace(/\.[a-z0-9]+$/i, '').replace(/[\[\]]/g, '')}](${url})`); st.textContent = 'Imagem inserida. Troque o texto entre [ ] pela legenda.'; }
        catch (err) { st.textContent = err.message; toast(err.message, 'error'); }
      }
    }
    $('#ins-imagem', dlg)?.addEventListener('click', async () => { const file = await escolherArquivo(); if (file) imagensNoTexto([file]); });
    $('#ins-grafico', dlg)?.addEventListener('click', () => inserir('[gráfico: Título do gráfico]\nJaneiro: 120\nFevereiro: 180\nMarço: 240'));
    if (canEdit) {
      ta.addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.some(x => /^image\//.test(x.type))) { e.preventDefault(); imagensNoTexto(fs); } });
      ta.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(x => x.kind === 'file')) { e.preventDefault(); ta.classList.add('soltar'); } });
      ta.addEventListener('dragleave', () => ta.classList.remove('soltar'));
      ta.addEventListener('drop', e => { const fs = [...(e.dataTransfer?.files || [])]; ta.classList.remove('soltar'); if (fs.length) { e.preventDefault(); imagensNoTexto(fs); } });
    }

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
