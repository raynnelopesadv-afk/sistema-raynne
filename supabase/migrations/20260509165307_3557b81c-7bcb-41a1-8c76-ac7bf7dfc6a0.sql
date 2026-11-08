ALTER TABLE public.clientes_fechados
  ADD COLUMN IF NOT EXISTS data_protocolo date,
  ADD COLUMN IF NOT EXISTS data_recebimento date;

CREATE INDEX IF NOT EXISTS idx_clientes_fechados_data_protocolo ON public.clientes_fechados(data_protocolo);
CREATE INDEX IF NOT EXISTS idx_clientes_fechados_data_recebimento ON public.clientes_fechados(data_recebimento);