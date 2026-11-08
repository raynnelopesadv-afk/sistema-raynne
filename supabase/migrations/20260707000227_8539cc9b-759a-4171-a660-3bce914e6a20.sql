-- ============================================================
-- Integração Meta Ads + Liderhub
-- ============================================================

create table if not exists public.meta_campaigns (
  id text primary key,
  name text not null,
  status text,
  objective text,
  daily_budget numeric,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.meta_adsets (
  id text primary key,
  campaign_id text references public.meta_campaigns(id) on delete cascade,
  name text not null,
  status text,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.meta_ads (
  id text primary key,
  adset_id text references public.meta_adsets(id) on delete cascade,
  campaign_id text references public.meta_campaigns(id) on delete cascade,
  name text not null,
  status text,
  creative_id text,
  creative_thumbnail_url text,
  creative_title text,
  creative_body text,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.meta_insights_daily (
  ad_id text not null references public.meta_ads(id) on delete cascade,
  date date not null,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric,
  cpc numeric,
  cpm numeric,
  frequency numeric,
  leads integer not null default 0,
  conversations integer not null default 0,
  raw_actions jsonb,
  synced_at timestamptz not null default now(),
  primary key (ad_id, date)
);
create index if not exists idx_meta_insights_date on public.meta_insights_daily(date);

create table if not exists public.lh_labels (
  id uuid primary key,
  kind text not null check (kind in ('status','source','tag','department','user')),
  name text not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.lh_leads (
  id uuid primary key,
  contact_number text,
  contact_name text,
  department_id uuid,
  status_id uuid,
  source_id uuid,
  connection_id uuid,
  agent_id uuid,
  user_id uuid,
  ticket_status text,
  integration text,
  tags uuid[] not null default '{}',
  created_at timestamptz,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists idx_lh_leads_created on public.lh_leads(created_at);
create index if not exists idx_lh_leads_status on public.lh_leads(status_id);
create index if not exists idx_lh_leads_source on public.lh_leads(source_id);

create table if not exists public.lead_class_map (
  label_id uuid primary key references public.lh_labels(id) on delete cascade,
  classification text not null check (classification in ('qualificado','mql','fechamento','desqualificado','perdido'))
);

create table if not exists public.integration_sync_logs (
  id uuid primary key default gen_random_uuid(),
  integration text not null check (integration in ('meta','liderhub')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  items integer not null default 0,
  error text
);
create index if not exists idx_sync_logs_integration on public.integration_sync_logs(integration, started_at desc);

alter table public.clientes_fechados
  add column if not exists meta_campaign_id text,
  add column if not exists meta_adset_id text,
  add column if not exists meta_ad_id text;

-- GRANTs (leitura para autenticados; escrita via service role)
grant select on public.meta_campaigns to authenticated;
grant select on public.meta_adsets to authenticated;
grant select on public.meta_ads to authenticated;
grant select on public.meta_insights_daily to authenticated;
grant select on public.lh_labels to authenticated;
grant select on public.lh_leads to authenticated;
grant select, insert, update, delete on public.lead_class_map to authenticated;
grant select on public.integration_sync_logs to authenticated;

grant all on public.meta_campaigns to service_role;
grant all on public.meta_adsets to service_role;
grant all on public.meta_ads to service_role;
grant all on public.meta_insights_daily to service_role;
grant all on public.lh_labels to service_role;
grant all on public.lh_leads to service_role;
grant all on public.lead_class_map to service_role;
grant all on public.integration_sync_logs to service_role;

-- RLS
alter table public.meta_campaigns enable row level security;
alter table public.meta_adsets enable row level security;
alter table public.meta_ads enable row level security;
alter table public.meta_insights_daily enable row level security;
alter table public.lh_labels enable row level security;
alter table public.lh_leads enable row level security;
alter table public.lead_class_map enable row level security;
alter table public.integration_sync_logs enable row level security;

drop policy if exists "meta_campaigns read" on public.meta_campaigns;
create policy "meta_campaigns read" on public.meta_campaigns for select to authenticated using (true);
drop policy if exists "meta_adsets read" on public.meta_adsets;
create policy "meta_adsets read"    on public.meta_adsets    for select to authenticated using (true);
drop policy if exists "meta_ads read" on public.meta_ads;
create policy "meta_ads read"       on public.meta_ads       for select to authenticated using (true);
drop policy if exists "meta_insights read" on public.meta_insights_daily;
create policy "meta_insights read"  on public.meta_insights_daily for select to authenticated using (true);
drop policy if exists "lh_labels read" on public.lh_labels;
create policy "lh_labels read"      on public.lh_labels      for select to authenticated using (true);
drop policy if exists "lh_leads read" on public.lh_leads;
create policy "lh_leads read"       on public.lh_leads       for select to authenticated using (true);
drop policy if exists "lead_class_map read" on public.lead_class_map;
create policy "lead_class_map read" on public.lead_class_map for select to authenticated using (true);
drop policy if exists "sync_logs read" on public.integration_sync_logs;
create policy "sync_logs read"      on public.integration_sync_logs for select to authenticated using (true);

drop policy if exists "lead_class_map write" on public.lead_class_map;
create policy "lead_class_map write" on public.lead_class_map for all to authenticated
  using (public.is_gestor_or_operador(auth.uid()))
  with check (public.is_gestor_or_operador(auth.uid()));
