-- Fechamento por IA: o closer assume a venda, conta para a meta normalmente,
-- mas a parcela de comissão do FECHAMENTO só é liberada no mês do protocolo,
-- junto com a parcela de protocolo.
alter table public.clientes_fechados
  add column if not exists fechado_por_ia boolean not null default false;
