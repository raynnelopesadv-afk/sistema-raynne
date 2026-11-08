-- =============================================================================
-- Bonificação por recebimento (ex.: estagiária que acompanha recebimentos)
--  - forma_recebimento no contrato: à vista ou parcelado
--    (no parcelado, a data de recebimento registrada é a da ÚLTIMA parcela)
--  - regras por beneficiário × produto × forma: valor fixo por contrato
--    ou % sobre o valor efetivamente recebido
-- =============================================================================

alter table public.clientes_fechados
  add column if not exists forma_recebimento text
    check (forma_recebimento in ('a_vista','parcelado'));

create table if not exists public.bonificacao_recebimento_regras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  forma text not null check (forma in ('a_vista','parcelado')),
  tipo text not null check (tipo in ('fixo','percentual')),
  valor numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, product_id, forma)
);

alter table public.bonificacao_recebimento_regras enable row level security;

drop policy if exists "bonif read" on public.bonificacao_recebimento_regras;
create policy "bonif read" on public.bonificacao_recebimento_regras
  for select to authenticated using (true);

drop policy if exists "bonif write gestor" on public.bonificacao_recebimento_regras;
create policy "bonif write gestor" on public.bonificacao_recebimento_regras
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));
