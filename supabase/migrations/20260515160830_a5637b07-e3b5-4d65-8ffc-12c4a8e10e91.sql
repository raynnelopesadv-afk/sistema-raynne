
-- Cria processos a partir de fechamentos já existentes que ainda não têm processo
INSERT INTO public.processos (descricao, tipo, status, valor, closer_id, product_id, divisao, cliente_id)
SELECT
  cf.nome_cliente,
  'judicial'::processo_tipo,
  CASE WHEN cf.protocolado THEN 'vendido'::processo_status ELSE 'em_andamento'::processo_status END,
  cf.valor,
  cf.closer_id,
  cf.product_id,
  cf.divisao,
  cf.id
FROM public.clientes_fechados cf
WHERE NOT EXISTS (
  SELECT 1 FROM public.processos p WHERE p.cliente_id = cf.id
);

CREATE OR REPLACE FUNCTION public.sync_processo_from_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.processos (descricao, tipo, status, valor, closer_id, product_id, divisao, cliente_id)
    VALUES (
      NEW.nome_cliente,
      'judicial'::processo_tipo,
      CASE WHEN NEW.protocolado THEN 'vendido'::processo_status ELSE 'em_andamento'::processo_status END,
      COALESCE(NEW.valor, 0),
      NEW.closer_id,
      NEW.product_id,
      NEW.divisao,
      NEW.id
    )
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.processos
    SET descricao = NEW.nome_cliente,
        valor = COALESCE(NEW.valor, 0),
        closer_id = NEW.closer_id,
        product_id = NEW.product_id,
        divisao = NEW.divisao,
        status = CASE WHEN NEW.protocolado THEN 'vendido'::processo_status ELSE 'em_andamento'::processo_status END,
        updated_at = now()
    WHERE cliente_id = NEW.id;
    -- Se não existir processo vinculado, cria
    IF NOT FOUND THEN
      INSERT INTO public.processos (descricao, tipo, status, valor, closer_id, product_id, divisao, cliente_id)
      VALUES (
        NEW.nome_cliente,
        'judicial'::processo_tipo,
        CASE WHEN NEW.protocolado THEN 'vendido'::processo_status ELSE 'em_andamento'::processo_status END,
        COALESCE(NEW.valor, 0),
        NEW.closer_id,
        NEW.product_id,
        NEW.divisao,
        NEW.id
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.processos WHERE cliente_id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_processo_from_cliente ON public.clientes_fechados;
CREATE TRIGGER trg_sync_processo_from_cliente
  AFTER INSERT OR UPDATE OR DELETE ON public.clientes_fechados
  FOR EACH ROW EXECUTE FUNCTION public.sync_processo_from_cliente();
