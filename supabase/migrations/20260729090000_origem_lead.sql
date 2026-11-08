-- Origem do lead (canal de aquisição): Meta Ads, Google Ads, Indicação, etc.
-- Regra: todo fechamento nasce como 'meta_ads' (padrão), editável no lançamento.
alter table public.clientes_fechados
  add column if not exists origem_lead text not null default 'meta_ads';
