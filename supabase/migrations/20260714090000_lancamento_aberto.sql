-- Qualquer usuário autenticado pode lançar vendas (exceto o papel agência).
-- Edição e qualificação continuam restritas às policies existentes.

drop policy if exists "clientes insert own or staff" on public.clientes_fechados;
drop policy if exists "clientes insert vendas" on public.clientes_fechados;
drop policy if exists "clientes insert auth" on public.clientes_fechados;

create policy "clientes insert auth" on public.clientes_fechados
  for insert to authenticated
  with check (not public.is_agencia(auth.uid()));
