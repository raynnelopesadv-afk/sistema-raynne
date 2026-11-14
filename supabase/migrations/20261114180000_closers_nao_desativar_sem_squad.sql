-- Corrige bug: ao editar o perfil de alguém do comercial (nome, celular etc.),
-- o gatilho desativava o closer quando não havia squad/papel de vendas,
-- e a Dra. Anielle, Comercial 01 e Comercial 02 sumiam dos fechamentos e do ranking.
-- Agora, sem squad/papel, o closer só tem o nome atualizado — nunca é desativado.
-- (Já aplicado no banco pelo SQL Editor em 14/11/2026.)
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

  IF _profile.squad_id IS NOT NULL THEN
    SELECT s.divisao INTO _divisao FROM public.squads s WHERE s.id = _profile.squad_id;
  END IF;

  IF _profile.user_id IS NULL OR _role IS NULL OR _divisao IS NULL THEN
    -- Sem squad/papel de vendas: mantém o closer como está, só acerta o nome.
    UPDATE public.closers
    SET nome = COALESCE(NULLIF(TRIM(_profile.display_name), ''), nome)
    WHERE id = _user_id
      AND _profile.display_name IS NOT NULL
      AND _profile.display_name NOT LIKE '%@%';
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

REVOKE EXECUTE ON FUNCTION public.sync_closer_from_profile(uuid) FROM PUBLIC, anon, authenticated;

-- Reativa a equipe comercial (desativada pelo bug)
UPDATE public.closers
SET ativo = true, status = 'ativo', data_desligamento = NULL
WHERE nome IN ('Dra. Anielle', 'Comercial 01', 'Comercial 02');
