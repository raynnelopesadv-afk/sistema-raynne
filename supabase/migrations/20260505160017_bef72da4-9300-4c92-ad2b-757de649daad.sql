DROP POLICY IF EXISTS "clientes insert vendas" ON public.clientes_fechados;
CREATE POLICY "clientes insert auth" ON public.clientes_fechados
  FOR INSERT TO authenticated WITH CHECK (true);