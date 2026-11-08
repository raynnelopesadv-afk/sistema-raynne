
ALTER TABLE public.clientes_fechados
  ADD COLUMN IF NOT EXISTS motivo_desqualificacao text,
  ADD COLUMN IF NOT EXISTS tipo_processo text;
