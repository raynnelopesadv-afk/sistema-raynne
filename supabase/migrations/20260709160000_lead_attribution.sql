-- Central de atribuição por telefone.
-- Une três fontes (CTWA via Liderhub, formulário via webhook da automação, manual)
-- e carimba meta_ad_id/adset/campaign nos contratos por telefone.

-- Normaliza telefone BR para uma chave canônica: DDD + 8 dígitos (sem 55, sem o 9 do celular).
create or replace function public.norm_phone(p text)
returns text language plpgsql immutable as $$
declare d text;
begin
  d := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  if length(d) >= 12 and left(d, 2) = '55' then
    d := substr(d, 3);
  end if;
  -- celular com 9 na frente (DDD + 9 + 8 = 11 dígitos): remove o 9
  if length(d) = 11 and substr(d, 3, 1) = '9' then
    d := substr(d, 1, 2) || substr(d, 4);
  end if;
  return nullif(right(d, 10), '');
end $$;

create table if not exists public.lead_attribution (
  phone            text primary key,           -- chave canônica (norm_phone)
  meta_ad_id       text,
  meta_adset_id    text,
  meta_campaign_id text,
  ad_name          text,
  adset_name       text,
  campaign_name    text,
  source           text,                        -- 'ctwa' | 'form' | 'manual'
  ctwa_clid        text,
  raw              jsonb,
  first_seen       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.lead_attribution enable row level security;
drop policy if exists "lead_attribution read" on public.lead_attribution;
create policy "lead_attribution read" on public.lead_attribution
  for select to authenticated using (true);

-- Enriquece adset/campaign/nomes a partir de meta_ads quando o ad_id casa.
-- Se o anúncio não for encontrado, preserva os nomes recebidos (não sobrescreve com null).
create or replace function public.lead_attribution_enrich()
returns trigger language plpgsql as $$
declare
  v_adset text; v_camp text; v_adname text; v_adsetname text; v_campname text;
begin
  new.updated_at := now();
  if new.meta_ad_id is not null then
    select a.adset_id, a.campaign_id, a.name, s.name, c.name
      into v_adset, v_camp, v_adname, v_adsetname, v_campname
    from public.meta_ads a
    left join public.meta_adsets s on s.id = a.adset_id
    left join public.meta_campaigns c on c.id = a.campaign_id
    where a.id = new.meta_ad_id;
    if found then
      new.meta_adset_id    := v_adset;
      new.meta_campaign_id := v_camp;
      new.ad_name          := v_adname;
      new.adset_name       := coalesce(v_adsetname, new.adset_name);
      new.campaign_name    := coalesce(v_campname, new.campaign_name);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_lead_attr_enrich on public.lead_attribution;
create trigger trg_lead_attr_enrich
  before insert or update on public.lead_attribution
  for each row execute function public.lead_attribution_enrich();

-- Ao gravar/atualizar atribuição, carimba os contratos daquele telefone (só se ainda vazio).
create or replace function public.lead_attribution_stamp_contracts()
returns trigger language plpgsql as $$
begin
  update public.clientes_fechados cf
     set meta_ad_id       = coalesce(cf.meta_ad_id, new.meta_ad_id),
         meta_adset_id    = coalesce(cf.meta_adset_id, new.meta_adset_id),
         meta_campaign_id = coalesce(cf.meta_campaign_id, new.meta_campaign_id)
   where public.norm_phone(cf.telefone) = new.phone
     and cf.meta_ad_id is null;
  return new;
end $$;

drop trigger if exists trg_lead_attr_stamp on public.lead_attribution;
create trigger trg_lead_attr_stamp
  after insert or update on public.lead_attribution
  for each row execute function public.lead_attribution_stamp_contracts();

-- Contrato novo/atualizado sem atribuição: procura na central por telefone.
create or replace function public.contract_lookup_attribution()
returns trigger language plpgsql as $$
begin
  if new.meta_ad_id is null and new.telefone is not null then
    select la.meta_ad_id, la.meta_adset_id, la.meta_campaign_id
      into new.meta_ad_id, new.meta_adset_id, new.meta_campaign_id
    from public.lead_attribution la
    where la.phone = public.norm_phone(new.telefone);
  end if;
  return new;
end $$;

drop trigger if exists trg_contract_lookup_attr on public.clientes_fechados;
create trigger trg_contract_lookup_attr
  before insert or update of telefone on public.clientes_fechados
  for each row execute function public.contract_lookup_attribution();

-- CTWA: extrai o ID do anúncio da Meta que o Liderhub grava em
-- raw.metadata.externalAdReply.sourceID e alimenta a central por telefone.
create or replace function public.lh_lead_ctwa_attr()
returns trigger language plpgsql as $$
declare ear jsonb; ad text; ph text;
begin
  ear := new.raw->'metadata'->'externalAdReply';
  if ear is null then return new; end if;
  ad := ear->>'sourceID';
  ph := public.norm_phone(new.contact_number);
  if ad is null or ph is null or coalesce(ear->>'sourceType', 'ad') <> 'ad' then return new; end if;
  insert into public.lead_attribution (phone, meta_ad_id, source, ctwa_clid, raw)
  values (ph, ad, 'ctwa', ear->>'ctwaClid', ear)
  on conflict (phone) do update set
    meta_ad_id = excluded.meta_ad_id,
    ctwa_clid  = excluded.ctwa_clid,
    raw        = excluded.raw,
    updated_at = now();
  return new;
end $$;

drop trigger if exists trg_lh_lead_ctwa on public.lh_leads;
create trigger trg_lh_lead_ctwa
  after insert or update of raw on public.lh_leads
  for each row execute function public.lh_lead_ctwa_attr();
