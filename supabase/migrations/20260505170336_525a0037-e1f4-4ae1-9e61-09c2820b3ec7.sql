-- Sincroniza usuários de vendas com a tabela de closers usada pelos fechamentos
CREATE OR REPLACE FUNCTION public.sync_closer_from_profile(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile record;
  _role app_role;
  _divisao divisao;
BEGIN
  SELECT p.user_id, p.display_name, p.email, p.squad_id, p.meta_mes
  INTO _profile
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  SELECT ur.role
  INTO _role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND ur.role IN ('sdr', 'closer', 'full_cycle')
  LIMIT 1;

  IF _profile.user_id IS NULL OR _role IS NULL OR _profile.squad_id IS NULL THEN
    UPDATE public.closers
    SET ativo = false, updated_at = now()
    WHERE id = _user_id;
    RETURN;
  END IF;

  SELECT s.divisao
  INTO _divisao
  FROM public.squads s
  WHERE s.id = _profile.squad_id;

  IF _divisao IS NULL THEN
    UPDATE public.closers
    SET ativo = false, updated_at = now()
    WHERE id = _user_id;
    RETURN;
  END IF;

  INSERT INTO public.closers (id, nome, divisao, squad_id, meta_mes, ativo, updated_at)
  VALUES (
    _user_id,
    COALESCE(NULLIF(TRIM(_profile.display_name), ''), _profile.email, 'Closer'),
    _divisao,
    _profile.squad_id,
    COALESCE(_profile.meta_mes, 0),
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      divisao = EXCLUDED.divisao,
      squad_id = EXCLUDED.squad_id,
      meta_mes = EXCLUDED.meta_mes,
      ativo = true,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_profile_closer_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_closer_from_profile(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_role_closer_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_closer_from_profile(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_squad_closer_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile record;
BEGIN
  FOR _profile IN
    SELECT p.user_id
    FROM public.profiles p
    WHERE p.squad_id = NEW.id
  LOOP
    PERFORM public.sync_closer_from_profile(_profile.user_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_closer ON public.profiles;
CREATE TRIGGER sync_profile_closer
AFTER INSERT OR UPDATE OF display_name, email, squad_id, meta_mes ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_closer_sync();

DROP TRIGGER IF EXISTS sync_user_role_closer ON public.user_roles;
CREATE TRIGGER sync_user_role_closer
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_role_closer_sync();

DROP TRIGGER IF EXISTS sync_squad_closer ON public.squads;
CREATE TRIGGER sync_squad_closer
AFTER UPDATE OF divisao, ativo ON public.squads
FOR EACH ROW
EXECUTE FUNCTION public.handle_squad_closer_sync();

-- Popula os closers atuais a partir dos usuários de vendas já cadastrados
DO $$
DECLARE
  _profile record;
BEGIN
  FOR _profile IN
    SELECT DISTINCT p.user_id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role IN ('sdr', 'closer', 'full_cycle')
  LOOP
    PERFORM public.sync_closer_from_profile(_profile.user_id);
  END LOOP;
END;
$$;