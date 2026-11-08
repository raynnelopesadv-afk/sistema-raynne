-- Tirar EXECUTE de anon nas funções security definer
revoke execute on function public.has_role(uuid, public.app_role) from anon, public;
revoke execute on function public.is_gestor_or_operador(uuid) from anon, public;
revoke execute on function public.handle_new_user() from anon, public;
revoke execute on function public.update_updated_at_column() from anon, public;
grant  execute on function public.has_role(uuid, public.app_role) to authenticated;
grant  execute on function public.is_gestor_or_operador(uuid)     to authenticated;

-- Storage: trocar SELECT público por authenticated only (bandeiras vistas via URL pública continuam acessíveis pela CDN do bucket público; o policy só afeta list/SELECT na tabela storage.objects)
drop policy if exists "squad-flags read public" on storage.objects;
create policy "squad-flags read auth" on storage.objects
  for select to authenticated using (bucket_id='squad-flags');
