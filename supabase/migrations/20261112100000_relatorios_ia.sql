-- =====================================================================
-- RELATÓRIOS DA IA (ex.: plano do comercial para o dia seguinte)
-- Gravado pelo importador (scripts/importar.mjs) a partir do lote que a
-- tarefa agendada do Claude gera no fim do dia. Idempotente.
-- =====================================================================
create table if not exists public.relatorios_ia (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                 -- 'comercial'
  data date not null,                 -- dia analisado
  titulo text,
  conteudo text not null,             -- texto em markdown simples
  dados jsonb,                        -- números usados na análise
  criado_em timestamptz not null default now(),
  unique (tipo, data)
);
create index if not exists ix_relatorios_ia on public.relatorios_ia (tipo, data desc);

alter table public.relatorios_ia enable row level security;
drop policy if exists "relatorios_ia leitura" on public.relatorios_ia;
create policy "relatorios_ia leitura" on public.relatorios_ia for select to authenticated
  using (public.acesso_juridico(auth.uid()));
grant select on public.relatorios_ia to authenticated;
