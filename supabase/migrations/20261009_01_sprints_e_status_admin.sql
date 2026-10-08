-- Sprints: toda a equipe (Utilizadores de qualquer área) edita; Status dos Sistemas: só administradores
create or replace function public.pode_escrever(t text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  p jsonb;
begin
  if not existe_admin() then return true; end if;
  p := perfil_atual();
  if p is null then return false; end if;
  if p->>'papel' = 'Administrador' then return true; end if;
  if p->>'papel' <> 'Utilizador' then return false; end if;
  return t = 'sprints' or p->>'area' = area_da_tabela(t);
end;
$$;
