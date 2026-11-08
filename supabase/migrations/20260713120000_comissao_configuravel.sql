-- =============================================================================
-- Comissionamento configurável por produto × nível × etapa
-- Baseado no Manual de Onboarding Comercial:
--   - Níveis de carreira (Entrada → Elite), atribuídos manualmente pelo gestor
--   - Cada produto define meta/mês e valor por contrato por nível e por etapa
--     (fechamento, protocolo, pagamento confirmado)
--   - Produtos podem ter variantes (ex.: 1 ou 2 plataformas) com valores próprios
--   - Piso de 50% da meta; 50–99% proporcional; fim de semana 1,5×
-- =============================================================================

-- 1) Níveis de carreira -------------------------------------------------------
create table if not exists public.career_levels (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem int not null,
  honorario_fixo numeric(12,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.career_levels enable row level security;

drop policy if exists "career_levels read" on public.career_levels;
create policy "career_levels read" on public.career_levels
  for select to authenticated using (true);

drop policy if exists "career_levels write gestor" on public.career_levels;
create policy "career_levels write gestor" on public.career_levels
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

insert into public.career_levels (nome, ordem, honorario_fixo)
select v.nome, v.ordem, v.fixo
from (values
  ('Entrada', 1, 2000),
  ('Nível 2', 2, 2500),
  ('Nível 3', 3, 3000),
  ('Nível 4', 4, 3500),
  ('Elite',   5, 4000)
) as v(nome, ordem, fixo)
where not exists (select 1 from public.career_levels cl where cl.nome = v.nome);

-- 2) Nível por closer ---------------------------------------------------------
alter table public.closers
  add column if not exists career_level_id uuid references public.career_levels(id) on delete set null;

-- 3) Variantes por produto (ex.: '1 plataforma', '2 plataformas') --------------
alter table public.products
  add column if not exists variantes text[] not null default '{}';

-- 4) Campos novos no contrato ---------------------------------------------------
alter table public.clientes_fechados
  add column if not exists variante text,
  add column if not exists data_pagamento_confirmado date;

-- 5) Meta mensal por produto × nível -------------------------------------------
create table if not exists public.product_metas (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  career_level_id uuid not null references public.career_levels(id) on delete cascade,
  meta_contratos int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, career_level_id)
);

alter table public.product_metas enable row level security;

drop policy if exists "product_metas read" on public.product_metas;
create policy "product_metas read" on public.product_metas
  for select to authenticated using (true);

drop policy if exists "product_metas write gestor" on public.product_metas;
create policy "product_metas write gestor" on public.product_metas
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- 6) Valor por contrato por produto × nível × etapa (× variante) ---------------
-- etapa: 'fechamento' (data_fechamento), 'protocolo' (data_protocolo),
--        'pagamento' (data_pagamento_confirmado)
-- variante null = valor padrão (aplica-se quando o contrato não tem variante
-- ou quando não há regra específica para a variante do contrato)
create table if not exists public.product_commission_stages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  career_level_id uuid not null references public.career_levels(id) on delete cascade,
  etapa text not null check (etapa in ('fechamento','protocolo','pagamento')),
  variante text,
  valor numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists product_commission_stages_uniq
  on public.product_commission_stages (product_id, career_level_id, etapa, coalesce(variante,''));

alter table public.product_commission_stages enable row level security;

drop policy if exists "pcs read" on public.product_commission_stages;
create policy "pcs read" on public.product_commission_stages
  for select to authenticated using (true);

drop policy if exists "pcs write gestor" on public.product_commission_stages;
create policy "pcs write gestor" on public.product_commission_stages
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));
