-- Ciclo de venda com precisão de horas/minutos: além da data, guarda o
-- MOMENTO exato em que o lead entrou (vem do CRM). Assim o tempo até o
-- fechamento pode ser exibido como "43min", "2h 15min", "3 dias 6h".
alter table public.clientes_fechados
  add column if not exists criacao_lead_em timestamptz;

-- Preenche o que já existe (só temos a data; assume início do dia).
update public.clientes_fechados
   set criacao_lead_em = (data_criacao_lead::timestamp at time zone 'America/Sao_Paulo')
 where data_criacao_lead is not null and criacao_lead_em is null;
