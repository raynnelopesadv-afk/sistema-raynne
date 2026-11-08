-- Índices para acelerar busca por nome (parcial, case-insensitive) e por CPF normalizado
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_clientes_fechados_nome_trgm
  ON public.clientes_fechados USING gin (lower(nome_cliente) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clientes_fechados_cpf_digits
  ON public.clientes_fechados (regexp_replace(coalesce(cpf, ''), '\D', '', 'g'));