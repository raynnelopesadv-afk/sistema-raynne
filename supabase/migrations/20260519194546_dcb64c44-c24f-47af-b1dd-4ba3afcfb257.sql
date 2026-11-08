
-- Campos retroativos em clientes_fechados
ALTER TABLE public.clientes_fechados
  ADD COLUMN IF NOT EXISTS cadastro_retroativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cadastrado_por_usuario_id uuid,
  ADD COLUMN IF NOT EXISTS data_cadastro_retroativo timestamptz,
  ADD COLUMN IF NOT EXISTS observacoes_retroativas text,
  ADD COLUMN IF NOT EXISTS considerar_comissao_retroativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS numero_protocolo text,
  ADD COLUMN IF NOT EXISTS observacoes_protocolo text,
  ADD COLUMN IF NOT EXISTS motivo_encerramento text,
  ADD COLUMN IF NOT EXISTS data_encerramento date,
  ADD COLUMN IF NOT EXISTS data_desqualificacao date;

CREATE INDEX IF NOT EXISTS idx_clientes_fechados_retroativo
  ON public.clientes_fechados(cadastro_retroativo)
  WHERE cadastro_retroativo = true;

-- Enum para status de closer
DO $$ BEGIN
  CREATE TYPE public.closer_status AS ENUM ('ativo', 'desligado', 'externo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Campos em closers
ALTER TABLE public.closers
  ADD COLUMN IF NOT EXISTS status public.closer_status NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS data_desligamento date,
  ADD COLUMN IF NOT EXISTS funcao text;

-- Backfill: closers inativos viram desligados
UPDATE public.closers SET status = 'desligado' WHERE ativo = false AND status = 'ativo';
