-- Blog do site (oriondelivery.com.br/blog)
-- Rode uma vez no Supabase: Dashboard > SQL Editor > New query > cole e rode.
-- Os posts ficam em registros com tabela = 'blog' (área MKT). O site lê só os publicados, por estas duas funções.

-- 1) 'blog' passa a ser da área MKT (quem é de MKT edita; o resto do sistema não muda)
create or replace function public.area_da_tabela(t text)
returns text language sql immutable as $$
  select case t
    when 'comercial' then 'Comercial' when 'crm' then 'Comercial' when 'ind_comercial' then 'Comercial'
    when 'cs' then 'CS' when 'ind_cs' then 'CS' when 'milestones' then 'CS' when 'milestone_avisos' then 'CS'
    when 'cs_rotina' then 'CS' when 'cs_semana' then 'CS'
    when 'cs_faturamento' then 'CS' when 'cs_clientes' then 'CS' when 'cs_faturamento_status' then 'CS'
    when 'leads' then 'MKT' when 'ind_mkt' then 'MKT' when 'visitas' then 'MKT' when 'form_sessoes' then 'MKT'
    when 'blog' then 'MKT'
    when 'perfis' then 'admin' when 'margem' then 'admin'
    else 'geral' end
$$;

-- 2) lista pública: só posts publicados, sem o texto completo
create or replace function public.blog_publico()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(p order by p->>'publicado_em' desc), '[]'::jsonb) from (
    select jsonb_build_object('slug', data->>'slug', 'titulo', data->>'titulo', 'resumo', data->>'resumo',
      'capa', data->>'capa', 'autor', data->>'autor', 'publicado_em', data->>'publicado_em') as p
    from registros
    where tabela = 'blog' and data->>'status' = 'Publicado' and coalesce(data->>'slug', '') <> ''
      and coalesce(data->>'publicado_em', '') <> '' and (data->>'publicado_em')::timestamptz <= now()
  ) x
$$;

-- 3) um post publicado, pelo endereço
create or replace function public.blog_post(slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('slug', data->>'slug', 'titulo', data->>'titulo', 'resumo', data->>'resumo',
    'capa', data->>'capa', 'autor', data->>'autor', 'publicado_em', data->>'publicado_em',
    'texto', data->>'texto', 'atualizado_em', updated_at)
  from registros
  where tabela = 'blog' and data->>'status' = 'Publicado' and data->>'slug' = blog_post.slug
    and (data->>'publicado_em')::timestamptz <= now()
  limit 1
$$;

revoke all on function public.blog_publico() from public;
revoke all on function public.blog_post(text) from public;
grant execute on function public.blog_publico() to anon, authenticated;
grant execute on function public.blog_post(text) to anon, authenticated;
notify pgrst, 'reload schema';

-- 4) Imagens do blog (capa e fotos/gráficos no texto): espaço público 'blog' no Storage.
-- Qualquer pessoa vê as imagens (o site precisa); só quem pode editar o blog (MKT e administradores) envia, troca ou apaga.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog', 'blog', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "blog: enviar imagens" on storage.objects;
drop policy if exists "blog: trocar imagens" on storage.objects;
drop policy if exists "blog: apagar imagens" on storage.objects;
create policy "blog: enviar imagens" on storage.objects for insert to authenticated
  with check (bucket_id = 'blog' and public.pode_escrever('blog'));
create policy "blog: trocar imagens" on storage.objects for update to authenticated
  using (bucket_id = 'blog' and public.pode_escrever('blog')) with check (bucket_id = 'blog' and public.pode_escrever('blog'));
create policy "blog: apagar imagens" on storage.objects for delete to authenticated
  using (bucket_id = 'blog' and public.pode_escrever('blog'));
