-- Cache do funil do Data Crazy (evita estourar o limite de 60 req/min da API).
create table if not exists public.datacrazy_funil_cache (
  chave text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.datacrazy_funil_cache enable row level security;

drop policy if exists "dc cache read" on public.datacrazy_funil_cache;
create policy "dc cache read" on public.datacrazy_funil_cache
  for select to authenticated using (true);
-- Escrita só pela função (service role bypassa RLS).
