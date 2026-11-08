-- handle_new_user: cria o profile e atribui o papel.
-- Bootstrap de admin portável: o PRIMEIRO usuário a se cadastrar vira 'gestor'
-- (nao existe gestor ainda); todos os demais entram como 'usuario'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));

  if not exists (select 1 from public.user_roles where role = 'gestor') then
    insert into public.user_roles (user_id, role) values (new.id, 'gestor');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'usuario');
  end if;

  return new;
end;
$function$;

-- (Re)cria trigger no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();