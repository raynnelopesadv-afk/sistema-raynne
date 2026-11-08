-- Instalação do banco — parte 6 de 8. Rodar em ordem no SQL Editor do Supabase.

-- ===== 20260709190000_role_agencia.sql
-- Papel "agencia": acesso restrito só às métricas de tráfego (tabelas meta_*).
-- Bloqueia no banco (RLS restritiva) toda tabela com PII, receita ou dados internos,
-- para que um login da agência não consiga ler esses dados nem pela API.

alter type public.app_role add value if not exists 'agencia';

create or replace function public.is_agencia(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = uid and role = 'agencia');
$$;

-- Políticas RESTRITIVAS: combinam em AND com as permissivas existentes.
-- Para usuários não-agência, is_agencia = false → nada muda.
-- Para a agência → nega o SELECT nessas tabelas.
do $$
declare t text;
begin
  foreach t in array array[
    'clientes_fechados','closers','agendamentos','faturamento_mensal','vendas',
    'processos','lh_leads','config','funis','squads','lead_class_map','lh_labels',
    'lead_attribution','integration_sync_logs'
  ] loop
    execute format('drop policy if exists "deny agencia %1$s" on public.%1$s', t);
    execute format(
      'create policy "deny agencia %1$s" on public.%1$s as restrictive for select to authenticated using (not public.is_agencia(auth.uid()))', t);
  end loop;
end $$;

-- profiles: a agência enxerga só o próprio (o app precisa disso para carregar).
drop policy if exists "deny agencia profiles" on public.profiles;
create policy "deny agencia profiles" on public.profiles as restrictive for select to authenticated
  using (user_id = auth.uid() or not public.is_agencia(auth.uid()));

-- Tabelas liberadas para a agência (métricas de tráfego): meta_campaigns, meta_adsets,
-- meta_ads, meta_insights_daily e products (nomes) seguem com as permissivas existentes.

