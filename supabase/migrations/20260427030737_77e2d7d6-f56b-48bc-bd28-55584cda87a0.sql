-- Função: usuário tem perfil de vendas?
CREATE OR REPLACE FUNCTION public.is_vendas(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('sdr','closer','full_cycle','gestor')
  )
$$;

-- Trigger: força status_qualificacao=pendente em todo INSERT
CREATE OR REPLACE FUNCTION public.force_pendente_on_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  NEW.status_qualificacao := 'pendente';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_pendente_clientes ON public.clientes_fechados;
CREATE TRIGGER trg_force_pendente_clientes
  BEFORE INSERT ON public.clientes_fechados
  FOR EACH ROW EXECUTE FUNCTION public.force_pendente_on_insert();

-- Trigger: bloqueia mudança de qualificação por quem não é gestor/operador
CREATE OR REPLACE FUNCTION public.guard_qualificacao_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status_qualificacao IS DISTINCT FROM OLD.status_qualificacao THEN
    IF NOT public.is_gestor_or_operador(auth.uid()) THEN
      RAISE EXCEPTION 'Apenas gestor ou operador técnico pode alterar a qualificação';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_qualificacao ON public.clientes_fechados;
CREATE TRIGGER trg_guard_qualificacao
  BEFORE UPDATE ON public.clientes_fechados
  FOR EACH ROW EXECUTE FUNCTION public.guard_qualificacao_update();

-- Restringir INSERT a usuários de vendas (ou gestor)
DROP POLICY IF EXISTS "clientes insert auth" ON public.clientes_fechados;
DROP POLICY IF EXISTS "clientes insert vendas" ON public.clientes_fechados;
CREATE POLICY "clientes insert vendas"
  ON public.clientes_fechados FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vendas(auth.uid()));