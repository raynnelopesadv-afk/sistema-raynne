-- 1. Add created_by to processos (FK para auth.users)
ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_processos_created_by ON public.processos(created_by);

-- 2. Trigger: preencher created_by automaticamente no INSERT (se nulo)
CREATE OR REPLACE FUNCTION public.set_processo_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_processo_created_by ON public.processos;
CREATE TRIGGER trg_set_processo_created_by
  BEFORE INSERT ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.set_processo_created_by();

-- 3. Trigger updated_at em processos (caso ainda não exista)
DROP TRIGGER IF EXISTS trg_processos_updated_at ON public.processos;
CREATE TRIGGER trg_processos_updated_at
  BEFORE UPDATE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();