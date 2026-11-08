-- =============================================================================
-- Projeção de êxito por produto
--   - exito_tipo/exito_valor: êxito projetado por contrato (R$ fixo ou % do
--     valor do contrato). Valor zerado -> usa a MÉDIA HISTÓRICA de êxito do produto.
--   - exito_probabilidade (%): ponderação da projeção. Vazia/zerada -> usa a
--     TAXA DE ÊXITO HISTÓRICA do produto (êxitos / resultados registrados).
--   - projecao_soma_inicial: soma o valor do contrato (honorários iniciais)
--     à projeção de cada contrato em andamento.
-- =============================================================================

alter table public.products
  add column if not exists exito_tipo text not null default 'fixo'
    check (exito_tipo in ('fixo','percentual')),
  add column if not exists exito_valor numeric(12,2) not null default 0,
  add column if not exists exito_probabilidade numeric(5,2),
  add column if not exists projecao_soma_inicial boolean not null default false;

-- Exemplos: AMEA projeta R$ 1.600 de êxito; UBER soma a inicial e usa histórico
update public.products
set exito_tipo = 'fixo', exito_valor = 1600, projecao_soma_inicial = false
where nome = '[EXEMPLO] AMEA / BPC';

update public.products
set projecao_soma_inicial = true
where nome = '[EXEMPLO] UBER / APPs';
