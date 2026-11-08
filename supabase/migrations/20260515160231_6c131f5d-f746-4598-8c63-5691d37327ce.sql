
ALTER TABLE public.clientes_fechados
  ADD COLUMN IF NOT EXISTS protocolado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teve_exito boolean,
  ADD COLUMN IF NOT EXISTS valor_exito numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_honorarios_recebidos numeric NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS percentual_comissao_qualificacao numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.auto_qualificar_protocolado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.protocolado = true AND NEW.data_protocolo IS NOT NULL THEN
    NEW.status_qualificacao := 'qualificado';
    IF NEW.qualificado_em IS NULL THEN
      NEW.qualificado_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_qualificar_protocolado ON public.clientes_fechados;
CREATE TRIGGER trg_auto_qualificar_protocolado
  BEFORE INSERT OR UPDATE OF protocolado, data_protocolo ON public.clientes_fechados
  FOR EACH ROW EXECUTE FUNCTION public.auto_qualificar_protocolado();
