-- ============================================================
-- Integração Meta Ads + Liderhub
-- Tabelas de campanhas, insights diários, leads, mapeamento de
-- funil, logs de sincronização e atribuição de origem nos
-- fechamentos. IDs externos como chave primária (sem duplicidade).
-- Escrita: apenas backend (service role). Leitura: autenticados.
-- ============================================================

-- 1) Meta: campanhas / conjuntos / anúncios -------------------
create table if not exists public.meta_campaigns (
  id text primary key,                -- ID real da Meta
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

-- 2) Métricas diárias por anúncio -----------------------------
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
  leads integer not null default 0,          -- action_type = lead
  conversations integer not null default 0,  -- conversas WhatsApp iniciadas
  raw_actions jsonb,
  synced_at timestamptz not null default now(),
  primary key (ad_id, date)
);
create index if not exists idx_meta_insights_date on public.meta_insights_daily(date);

-- 3) Liderhub: dicionário de rótulos e leads -------------------
create table if not exists public.lh_labels (
  id uuid primary key,                -- ID real do Liderhub
  kind text not null check (kind in ('status','source','tag','department','user')),
  name text not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.lh_leads (
  id uuid primary key,                -- ID do chat/contato no Liderhub
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

-- 4) Mapeamento configurável do funil --------------------------
-- Classifica cada rótulo (status/tag) do Liderhub em um estágio
-- do funil do BI. Editável pela interface, sem mexer em código.
create table if not exists public.lead_class_map (
  label_id uuid primary key references public.lh_labels(id) on delete cascade,
  classification text not null check (classification in ('qualificado','mql','fechamento','desqualificado','perdido'))
);

-- 5) Logs de sincronização -------------------------------------
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

-- 6) Atribuição de origem nos fechamentos ----------------------
alter table public.clientes_fechados
  add column if not exists meta_campaign_id text,
  add column if not exists meta_adset_id text,
  add column if not exists meta_ad_id text;

-- 7) RLS --------------------------------------------------------
alter table public.meta_campaigns enable row level security;
alter table public.meta_adsets enable row level security;
alter table public.meta_ads enable row level security;
alter table public.meta_insights_daily enable row level security;
alter table public.lh_labels enable row level security;
alter table public.lh_leads enable row level security;
alter table public.lead_class_map enable row level security;
alter table public.integration_sync_logs enable row level security;

-- Leitura para qualquer usuário autenticado
create policy "meta_campaigns read" on public.meta_campaigns for select to authenticated using (true);
create policy "meta_adsets read"    on public.meta_adsets    for select to authenticated using (true);
create policy "meta_ads read"       on public.meta_ads       for select to authenticated using (true);
create policy "meta_insights read"  on public.meta_insights_daily for select to authenticated using (true);
create policy "lh_labels read"      on public.lh_labels      for select to authenticated using (true);
create policy "lh_leads read"       on public.lh_leads       for select to authenticated using (true);
create policy "lead_class_map read" on public.lead_class_map for select to authenticated using (true);
create policy "sync_logs read"      on public.integration_sync_logs for select to authenticated using (true);

-- Mapeamento do funil: gestor/operador pode editar pela interface
create policy "lead_class_map write" on public.lead_class_map for all to authenticated
  using (public.is_gestor_or_operador(auth.uid()))
  with check (public.is_gestor_or_operador(auth.uid()));

-- Escrita nas demais: somente service role (edge functions) — sem policy de insert/update.
