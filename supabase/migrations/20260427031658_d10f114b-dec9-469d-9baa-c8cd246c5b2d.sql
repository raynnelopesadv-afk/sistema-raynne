ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS squad_id uuid REFERENCES public.squads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_squad_id ON public.profiles(squad_id);