-- Instalação do banco — parte 3 de 8. Rodar em ordem no SQL Editor do Supabase.

-- ===== 20260427030737_77e2d7d6-f56b-48bc-bd28-55584cda87a0.sql
-- Função: usuário tem perfil de vendas?
CREATE OR REPLACE FUNCTION public.is_vendas(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('sdr','closer','full_cycle','gestor')
  )
$$;

-- Trigger: força status_qualificacao=pendente em todo INSERT
CREATE OR REPLACE FUNCTION public.force_pendente_on_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  NEW.status_qualificacao := 'pendente';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_pendente_clientes ON public.clientes_fechados;
CREATE TRIGGER trg_force_pendente_clientes
  BEFORE INSERT ON public.clientes_fechados
  FOR EACH ROW EXECUTE FUNCTION public.force_pendente_on_insert();

-- Trigger: bloqueia mudança de qualificação por quem não é gestor/operador
CREATE OR REPLACE FUNCTION public.guard_qualificacao_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status_qualificacao IS DISTINCT FROM OLD.status_qualificacao THEN
    IF NOT public.is_gestor_or_operador(auth.uid()) THEN
      RAISE EXCEPTION 'Apenas gestor ou operador técnico pode alterar a qualificação';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_qualificacao ON public.clientes_fechados;
CREATE TRIGGER trg_guard_qualificacao
  BEFORE UPDATE ON public.clientes_fechados
  FOR EACH ROW EXECUTE FUNCTION public.guard_qualificacao_update();

-- Restringir INSERT a usuários de vendas (ou gestor)
DROP POLICY IF EXISTS "clientes insert auth" ON public.clientes_fechados;
DROP POLICY IF EXISTS "clientes insert vendas" ON public.clientes_fechados;
CREATE POLICY "clientes insert vendas"
  ON public.clientes_fechados FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vendas(auth.uid()));

-- ===== 20260427031658_d10f114b-dec9-469d-9baa-c8cd246c5b2d.sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS squad_id uuid REFERENCES public.squads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_squad_id ON public.profiles(squad_id);

-- ===== 20260504195353_7e258217-d81c-41dc-b8c9-076f13e80e49.sql
-- Adiciona timestamp completo do fechamento (data + hora) e da qualificação
ALTER TABLE public.clientes_fechados
  ADD COLUMN IF NOT EXISTS fechado_em timestamptz,
  ADD COLUMN IF NOT EXISTS qualificado_em timestamptz;

-- Backfill: usa data_fechamento (date) ou created_at como ponto de partida
UPDATE public.clientes_fechados
SET fechado_em = COALESCE(fechado_em, (data_fechamento::timestamp AT TIME ZONE 'America/Sao_Paulo'), created_at)
WHERE fechado_em IS NULL;

UPDATE public.clientes_fechados
SET qualificado_em = COALESCE(qualificado_em, updated_at)
WHERE status_qualificacao = 'qualificado' AND qualificado_em IS NULL;

-- Trigger: marca qualificado_em automaticamente quando status muda para qualificado
CREATE OR REPLACE FUNCTION public.set_qualificado_em()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status_qualificacao = 'qualificado'
     AND (OLD.status_qualificacao IS DISTINCT FROM 'qualificado') THEN
    NEW.qualificado_em := now();
  END IF;
  IF NEW.status_qualificacao <> 'qualificado' THEN
    NEW.qualificado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_qualificado_em ON public.clientes_fechados;
CREATE TRIGGER trg_set_qualificado_em
BEFORE UPDATE OF status_qualificacao ON public.clientes_fechados
FOR EACH ROW
EXECUTE FUNCTION public.set_qualificado_em();

-- ===== 20260504202937_94ed7112-f5cb-486a-a820-d5f5068dadae.sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS meta_mes integer NOT NULL DEFAULT 0;

-- ===== 20260505160017_bef72da4-9300-4c92-ad2b-757de649daad.sql
DROP POLICY IF EXISTS "clientes insert vendas" ON public.clientes_fechados;
CREATE POLICY "clientes insert auth" ON public.clientes_fechados
  FOR INSERT TO authenticated WITH CHECK (true);

-- ===== 20260505161713_1ac86081-44d6-4799-afd5-150d5ec2c170.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clientes_fechados'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes_fechados;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agendamentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.config;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'squads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.squads;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- ===== 20260505170336_525a0037-e1f4-4ae1-9e61-09c2820b3ec7.sql
-- Sincroniza usuários de vendas com a tabela de closers usada pelos fechamentos
CREATE OR REPLACE FUNCTION public.sync_closer_from_profile(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile record;
  _role app_role;
  _divisao divisao;
BEGIN
  SELECT p.user_id, p.display_name, p.email, p.squad_id, p.meta_mes
  INTO _profile
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  SELECT ur.role
  INTO _role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND ur.role IN ('sdr', 'closer', 'full_cycle')
  LIMIT 1;

  IF _profile.user_id IS NULL OR _role IS NULL OR _profile.squad_id IS NULL THEN
    UPDATE public.closers
    SET ativo = false, updated_at = now()
    WHERE id = _user_id;
    RETURN;
  END IF;

  SELECT s.divisao
  INTO _divisao
  FROM public.squads s
  WHERE s.id = _profile.squad_id;

  IF _divisao IS NULL THEN
    UPDATE public.closers
    SET ativo = false, updated_at = now()
    WHERE id = _user_id;
    RETURN;
  END IF;

  INSERT INTO public.closers (id, nome, divisao, squad_id, meta_mes, ativo, updated_at)
  VALUES (
    _user_id,
    COALESCE(NULLIF(TRIM(_profile.display_name), ''), _profile.email, 'Closer'),
    _divisao,
    _profile.squad_id,
    COALESCE(_profile.meta_mes, 0),
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      divisao = EXCLUDED.divisao,
      squad_id = EXCLUDED.squad_id,
      meta_mes = EXCLUDED.meta_mes,
      ativo = true,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_profile_closer_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_closer_from_profile(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_role_closer_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_closer_from_profile(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_squad_closer_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile record;
BEGIN
  FOR _profile IN
    SELECT p.user_id
    FROM public.profiles p
    WHERE p.squad_id = NEW.id
  LOOP
    PERFORM public.sync_closer_from_profile(_profile.user_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_closer ON public.profiles;
CREATE TRIGGER sync_profile_closer
AFTER INSERT OR UPDATE OF display_name, email, squad_id, meta_mes ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_closer_sync();

DROP TRIGGER IF EXISTS sync_user_role_closer ON public.user_roles;
CREATE TRIGGER sync_user_role_closer
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_role_closer_sync();

DROP TRIGGER IF EXISTS sync_squad_closer ON public.squads;
CREATE TRIGGER sync_squad_closer
AFTER UPDATE OF divisao, ativo ON public.squads
FOR EACH ROW
EXECUTE FUNCTION public.handle_squad_closer_sync();

-- Popula os closers atuais a partir dos usuários de vendas já cadastrados
DO $$
DECLARE
  _profile record;
BEGIN
  FOR _profile IN
    SELECT DISTINCT p.user_id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role IN ('sdr', 'closer', 'full_cycle')
  LOOP
    PERFORM public.sync_closer_from_profile(_profile.user_id);
  END LOOP;
END;
$$;

-- ===== 20260505170352_0da97222-4950-4fc3-9fa5-731f39201f86.sql
REVOKE EXECUTE ON FUNCTION public.sync_closer_from_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_profile_closer_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_user_role_closer_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_squad_closer_sync() FROM PUBLIC, anon, authenticated;

-- ===== 20260505182806_efb7466c-ec09-48b3-bcc7-d716f5b7f810.sql
CREATE POLICY "clientes update own closer"
ON public.clientes_fechados
FOR UPDATE
TO authenticated
USING (closer_id = auth.uid())
WITH CHECK (closer_id = auth.uid());

-- ===== 20260509165307_3557b81c-7bcb-41a1-8c76-ac7bf7dfc6a0.sql
ALTER TABLE public.clientes_fechados
  ADD COLUMN IF NOT EXISTS data_protocolo date,
  ADD COLUMN IF NOT EXISTS data_recebimento date;

CREATE INDEX IF NOT EXISTS idx_clientes_fechados_data_protocolo ON public.clientes_fechados(data_protocolo);
CREATE INDEX IF NOT EXISTS idx_clientes_fechados_data_recebimento ON public.clientes_fechados(data_recebimento);

-- ===== 20260515160231_6c131f5d-f746-4598-8c63-5691d37327ce.sql

ALTER TABLE public.clientes_fechados
  ADD COLUMN IF NOT EXISTS protocolado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teve_exito boolean,
  ADD COLUMN IF NOT EXISTS valor_exito numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_honorarios_recebidos numeric NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS percentual_comissao_qualificacao numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.auto_qualificar_protocolado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.protocolado = true AND NEW.data_protocolo IS NOT NULL THEN
    NEW.status_qualificacao := 'qualificado';
    IF NEW.qualificado_em IS NULL THEN
      NEW.qualificado_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_qualificar_protocolado ON public.clientes_fechados;
CREATE TRIGGER trg_auto_qualificar_protocolado
  BEFORE INSERT OR UPDATE OF protocolado, data_protocolo ON public.clientes_fechados
  FOR EACH ROW EXECUTE FUNCTION public.auto_qualificar_protocolado();


-- ===== 20260515160830_a5637b07-e3b5-4d65-8ffc-12c4a8e10e91.sql

-- Cria processos a partir de fechamentos já existentes que ainda não têm processo
INSERT INTO public.processos (descricao, tipo, status, valor, closer_id, product_id, divisao, cliente_id)
SELECT
  cf.nome_cliente,
  'judicial'::processo_tipo,
  CASE WHEN cf.protocolado THEN 'vendido'::processo_status ELSE 'em_andamento'::processo_status END,
  cf.valor,
  cf.closer_id,
  cf.product_id,
  cf.divisao,
  cf.id
FROM public.clientes_fechados cf
WHERE NOT EXISTS (
  SELECT 1 FROM public.processos p WHERE p.cliente_id = cf.id
);

CREATE OR REPLACE FUNCTION public.sync_processo_from_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.processos (descricao, tipo, status, valor, closer_id, product_id, divisao, cliente_id)
    VALUES (
      NEW.nome_cliente,
      'judicial'::processo_tipo,
      CASE WHEN NEW.protocolado THEN 'vendido'::processo_status ELSE 'em_andamento'::processo_status END,
      COALESCE(NEW.valor, 0),
      NEW.closer_id,
      NEW.product_id,
      NEW.divisao,
      NEW.id
    )
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.processos
    SET descricao = NEW.nome_cliente,
        valor = COALESCE(NEW.valor, 0),
        closer_id = NEW.closer_id,
        product_id = NEW.product_id,
        divisao = NEW.divisao,
        status = CASE WHEN NEW.protocolado THEN 'vendido'::processo_status ELSE 'em_andamento'::processo_status END,
        updated_at = now()
    WHERE cliente_id = NEW.id;
    -- Se não existir processo vinculado, cria
    IF NOT FOUND THEN
      INSERT INTO public.processos (descricao, tipo, status, valor, closer_id, product_id, divisao, cliente_id)
      VALUES (
        NEW.nome_cliente,
        'judicial'::processo_tipo,
        CASE WHEN NEW.protocolado THEN 'vendido'::processo_status ELSE 'em_andamento'::processo_status END,
        COALESCE(NEW.valor, 0),
        NEW.closer_id,
        NEW.product_id,
        NEW.divisao,
        NEW.id
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.processos WHERE cliente_id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_processo_from_cliente ON public.clientes_fechados;
CREATE TRIGGER trg_sync_processo_from_cliente
  AFTER INSERT OR UPDATE OR DELETE ON public.clientes_fechados
  FOR EACH ROW EXECUTE FUNCTION public.sync_processo_from_cliente();


-- ===== 20260515161707_ac0bfbb4-1550-489d-bdec-220ec37cebe4.sql

ALTER TABLE public.clientes_fechados
  ADD COLUMN IF NOT EXISTS motivo_desqualificacao text,
  ADD COLUMN IF NOT EXISTS tipo_processo text;


-- ===== 20260515162026_fa31fa1d-b69e-49dd-a130-5941ecff504e.sql

CREATE OR REPLACE FUNCTION public.auto_qualificar_protocolado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Se o usuário está marcando como desqualificado, respeita.
  IF NEW.status_qualificacao = 'desqualificado' THEN
    RETURN NEW;
  END IF;

  IF NEW.protocolado = true AND NEW.data_protocolo IS NOT NULL THEN
    NEW.status_qualificacao := 'qualificado';
    IF NEW.qualificado_em IS NULL THEN
      NEW.qualificado_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;


-- ===== 20260515162742_5ef0d1cb-103e-4b01-8f41-d52da3c6e54b.sql
-- Índices para acelerar busca por nome (parcial, case-insensitive) e por CPF normalizado
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_clientes_fechados_nome_trgm
  ON public.clientes_fechados USING gin (lower(nome_cliente) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clientes_fechados_cpf_digits
  ON public.clientes_fechados (regexp_replace(coalesce(cpf, ''), '\D', '', 'g'));

-- ===== 20260515211642_5ca1ad1b-f8c9-4544-8ee6-12d4578ea35f.sql
CREATE POLICY "closers insert auth" ON public.closers FOR INSERT TO authenticated WITH CHECK (true);

-- ===== 20260519194546_dcb64c44-c24f-47af-b1dd-4ba3afcfb257.sql

-- Campos retroativos em clientes_fechados
ALTER TABLE public.clientes_fechados
  ADD COLUMN IF NOT EXISTS cadastro_retroativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cadastrado_por_usuario_id uuid,
  ADD COLUMN IF NOT EXISTS data_cadastro_retroativo timestamptz,
  ADD COLUMN IF NOT EXISTS observacoes_retroativas text,
  ADD COLUMN IF NOT EXISTS considerar_comissao_retroativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS numero_protocolo text,
  ADD COLUMN IF NOT EXISTS observacoes_protocolo text,
  ADD COLUMN IF NOT EXISTS motivo_encerramento text,
  ADD COLUMN IF NOT EXISTS data_encerramento date,
  ADD COLUMN IF NOT EXISTS data_desqualificacao date;

CREATE INDEX IF NOT EXISTS idx_clientes_fechados_retroativo
  ON public.clientes_fechados(cadastro_retroativo)
  WHERE cadastro_retroativo = true;

-- Enum para status de closer
DO $$ BEGIN
  CREATE TYPE public.closer_status AS ENUM ('ativo', 'desligado', 'externo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Campos em closers
ALTER TABLE public.closers
  ADD COLUMN IF NOT EXISTS status public.closer_status NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS data_desligamento date,
  ADD COLUMN IF NOT EXISTS funcao text;

-- Backfill: closers inativos viram desligados
UPDATE public.closers SET status = 'desligado' WHERE ativo = false AND status = 'ativo';


-- ===== 20260603225021_354be515-b7e0-4e88-b4d6-75aa49e83698.sql

-- Tighten agendamentos UPDATE policy: only the owning closer or a gestor
DROP POLICY IF EXISTS "agend update auth" ON public.agendamentos;
CREATE POLICY "agend update owner or gestor"
ON public.agendamentos
FOR UPDATE
TO authenticated
USING (closer_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role))
WITH CHECK (closer_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

-- Restrict closers INSERT to gestor only
DROP POLICY IF EXISTS "closers insert auth" ON public.closers;
CREATE POLICY "closers insert gestor"
ON public.closers
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

-- Remove sensitive tables from realtime publication to prevent broadcast exposure
ALTER PUBLICATION supabase_realtime DROP TABLE public.clientes_fechados;
ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
ALTER PUBLICATION supabase_realtime DROP TABLE public.config;


-- ===== 20260605033156_cc6ab634-eed5-43c2-bb0a-1318b30f7962.sql

-- agendamentos INSERT: enforce closer_id matches caller (or gestor)
DROP POLICY IF EXISTS "agend insert auth" ON public.agendamentos;
CREATE POLICY "agend insert own or gestor"
ON public.agendamentos
FOR INSERT TO authenticated
WITH CHECK (closer_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

-- clientes_fechados INSERT: enforce closer_id matches caller (or gestor/operador)
DROP POLICY IF EXISTS "clientes insert auth" ON public.clientes_fechados;
CREATE POLICY "clientes insert own or staff"
ON public.clientes_fechados
FOR INSERT TO authenticated
WITH CHECK (
  closer_id = auth.uid()
  OR public.is_gestor_or_operador(auth.uid())
);

-- vendas INSERT: enforce closer_id matches caller (or gestor)
DROP POLICY IF EXISTS "vendas insert auth" ON public.vendas;
CREATE POLICY "vendas insert own or gestor"
ON public.vendas
FOR INSERT TO authenticated
WITH CHECK (closer_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

-- Remove agendamentos from realtime publication (contains phone numbers, no per-row auth on realtime.messages)
ALTER PUBLICATION supabase_realtime DROP TABLE public.agendamentos;


-- ===== 20260706210000_meta_ads_liderhub_integration.sql
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


-- ===== 20260707000000_ad_message_attribution.sql
-- Atribuição automática por anúncio via mensagem pré-preenchida (CTWA).
-- meta_ads.prefilled_message: texto pré-preenchido do criativo (Meta).
-- lh_leads.first_message: 1ª mensagem recebida do lead (Liderhub).
-- Casando os dois, o BI liga cada lead ao anúncio exato — sem input manual.

alter table public.meta_ads
  add column if not exists prefilled_message text;

alter table public.lh_leads
  add column if not exists first_message text;

create index if not exists idx_lh_leads_first_message
  on public.lh_leads ((left(first_message, 120)))
  where first_message is not null and first_message <> '';


-- ===== 20260707000227_8539cc9b-759a-4171-a660-3bce914e6a20.sql
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

