-- Rastreabilidade: guarda o ID do lead no Data Crazy junto com o fechamento.
-- Permite conferir, a qualquer momento, se o CPF/telefone gravado aqui bate
-- com o que está no CRM hoje (e de qual lead exatamente veio o dado).
alter table public.clientes_fechados
  add column if not exists dc_lead_id text;
