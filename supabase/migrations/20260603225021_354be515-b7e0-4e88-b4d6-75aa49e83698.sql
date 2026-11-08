
-- Tighten agendamentos UPDATE policy: only the owning closer or a gestor
DROP POLICY IF EXISTS "agend update auth" ON public.agendamentos;
CREATE POLICY "agend update owner or gestor"
ON public.agendamentos
FOR UPDATE
TO authenticated
USING (closer_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role))
WITH CHECK (closer_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

-- Restrict closers INSERT to gestor only
DROP POLICY IF EXISTS "closers insert auth" ON public.closers;
CREATE POLICY "closers insert gestor"
ON public.closers
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

-- Remove sensitive tables from realtime publication to prevent broadcast exposure
ALTER PUBLICATION supabase_realtime DROP TABLE public.clientes_fechados;
ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
ALTER PUBLICATION supabase_realtime DROP TABLE public.config;
