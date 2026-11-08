CREATE POLICY "clientes update own closer"
ON public.clientes_fechados
FOR UPDATE
TO authenticated
USING (closer_id = auth.uid())
WITH CHECK (closer_id = auth.uid());