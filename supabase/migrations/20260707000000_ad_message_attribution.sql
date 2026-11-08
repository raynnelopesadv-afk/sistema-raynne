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
