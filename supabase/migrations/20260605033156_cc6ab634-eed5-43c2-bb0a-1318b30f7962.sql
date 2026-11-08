
-- agendamentos INSERT: enforce closer_id matches caller (or gestor)
DROP POLICY IF EXISTS "agend insert auth" ON public.agendamentos;
CREATE POLICY "agend insert own or gestor"
ON public.agendamentos
FOR INSERT TO authenticated
WITH CHECK (closer_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

-- clientes_fechados INSERT: enforce closer_id matches caller (or gestor/operador)
DROP POLICY IF EXISTS "clientes insert auth" ON public.clientes_fechados;
CREATE POLICY "clientes insert own or staff"
ON public.clientes_fechados
FOR INSERT TO authenticated
WITH CHECK (
  closer_id = auth.uid()
  OR public.is_gestor_or_operador(auth.uid())
);

-- vendas INSERT: enforce closer_id matches caller (or gestor)
DROP POLICY IF EXISTS "vendas insert auth" ON public.vendas;
CREATE POLICY "vendas insert own or gestor"
ON public.vendas
FOR INSERT TO authenticated
WITH CHECK (closer_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

-- Remove agendamentos from realtime publication (contains phone numbers, no per-row auth on realtime.messages)
ALTER PUBLICATION supabase_realtime DROP TABLE public.agendamentos;
