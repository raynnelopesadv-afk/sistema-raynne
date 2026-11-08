-- Regra de honorários iniciais por produto.
-- Quando ligada, o contrato ganha o campo "Recebimento dos honorários iniciais"
-- (data_pagamento_confirmado) — a assinatura e o recebimento podem ocorrer em
-- datas diferentes (ex.: cliente paga a inicial em até 30 dias).
-- A etapa de comissão "Pagamento confirmado" é creditada no mês desse recebimento.

alter table public.products
  add column if not exists tem_honorarios_iniciais boolean not null default false;

-- Produto de exemplo UBER usa a regra
update public.products
set tem_honorarios_iniciais = true
where nome = '[EXEMPLO] UBER / APPs';
