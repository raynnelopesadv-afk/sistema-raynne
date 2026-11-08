-- Espelhamento Data Crazy — fundação:
--   - closers.email: para casar o atendente do DC (por e-mail) com o closer.
--   - clientes_fechados.dc_business_id: id do negócio no DC (evita duplicar).
--   - clientes_fechados.incompleto: fechamento vindo do DC com dados faltando
--     (fica fora da comissão e destacado até ser completado).
--   - clientes_fechados.origem: 'manual' ou 'datacrazy'.
alter table public.closers
  add column if not exists email text;

alter table public.clientes_fechados
  add column if not exists dc_business_id text,
  add column if not exists incompleto boolean not null default false,
  add column if not exists origem text not null default 'manual';

create unique index if not exists ux_clientes_dc_business
  on public.clientes_fechados (dc_business_id) where dc_business_id is not null;
