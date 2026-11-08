-- Campos personalizados por PRODUTO, preenchidos na ficha do processo.
-- Ex.: Salário Maternidade tem campos que Motorista/App não tem.
-- Tipos: texto, numero, data, select (lista suspensa) e multi (múltipla escolha).

create table if not exists public.product_campos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null,
  tipo text not null check (tipo in ('texto','numero','data','select','multi')),
  opcoes text[] not null default '{}',   -- usado em select/multi
  obrigatorio boolean not null default false,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.product_campos enable row level security;

drop policy if exists "product_campos read" on public.product_campos;
create policy "product_campos read" on public.product_campos
  for select to authenticated using (true);

drop policy if exists "product_campos gestor" on public.product_campos;
create policy "product_campos gestor" on public.product_campos
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- Valores preenchidos, por contrato: { "<campo_id>": valor }
alter table public.clientes_fechados
  add column if not exists campos_personalizados jsonb not null default '{}'::jsonb;

-- Visibilidade no kanban: por regra o campo aparece no card; o gestor decide
-- o que esconder (ícone de olho na configuração do produto).
alter table public.product_campos
  add column if not exists visivel_kanban boolean not null default true;
