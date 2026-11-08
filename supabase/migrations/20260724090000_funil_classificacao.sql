-- Classificação das etapas do funil por pipe: quais etapas são "ganho" e
-- quais são "perdido" (o resto é neutro / em andamento). Cada pipe do Data
-- Crazy funciona diferente, então isso é configurável direto no BI.
create table if not exists public.funil_classificacao (
  pipeline_id text not null,
  stage_id text not null,
  tipo text not null check (tipo in ('ganho','perdido')),
  updated_at timestamptz not null default now(),
  primary key (pipeline_id, stage_id)
);
alter table public.funil_classificacao enable row level security;

drop policy if exists "funil_class read" on public.funil_classificacao;
create policy "funil_class read" on public.funil_classificacao
  for select to authenticated using (true);

drop policy if exists "funil_class write" on public.funil_classificacao;
create policy "funil_class write" on public.funil_classificacao
  for all to authenticated using (true) with check (true);
