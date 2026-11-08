-- Data de criação do lead (entrada) — base para o tempo de ciclo de venda:
-- do momento em que o lead entrou até o fechamento. Vem do CRM (Data Crazy).
alter table public.clientes_fechados
  add column if not exists data_criacao_lead date;
