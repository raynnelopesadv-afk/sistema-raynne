-- Adiciona timestamp completo do fechamento (data + hora) e da qualificação
ALTER TABLE public.clientes_fechados
  ADD COLUMN IF NOT EXISTS fechado_em timestamptz,
  ADD COLUMN IF NOT EXISTS qualificado_em timestamptz;

-- Backfill: usa data_fechamento (date) ou created_at como ponto de partida
UPDATE public.clientes_fechados
SET fechado_em = COALESCE(fechado_em, (data_fechamento::timestamp AT TIME ZONE 'America/Sao_Paulo'), created_at)
WHERE fechado_em IS NULL;

UPDATE public.clientes_fechados
SET qualificado_em = COALESCE(qualificado_em, updated_at)
WHERE status_qualificacao = 'qualificado' AND qualificado_em IS NULL;

-- Trigger: marca qualificado_em automaticamente quando status muda para qualificado
CREATE OR REPLACE FUNCTION public.set_qualificado_em()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status_qualificacao = 'qualificado'
     AND (OLD.status_qualificacao IS DISTINCT FROM 'qualificado') THEN
    NEW.qualificado_em := now();
  END IF;
  IF NEW.status_qualificacao <> 'qualificado' THEN
    NEW.qualificado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_qualificado_em ON public.clientes_fechados;
CREATE TRIGGER trg_set_qualificado_em
BEFORE UPDATE OF status_qualificacao ON public.clientes_fechados
FOR EACH ROW
EXECUTE FUNCTION public.set_qualificado_em();