create table public.funis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  divisao public.divisao not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.funis enable row level security;
create trigger trg_funis_updated before update on public.funis
for each row execute function public.update_updated_at_column();

create policy "funis read"       on public.funis for select to authenticated using (true);
create policy "funis gestor all" on public.funis for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));
