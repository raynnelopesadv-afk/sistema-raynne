-- UF (estado) do fechamento. Preenchido automaticamente pelo DDD do telefone,
-- mas editável na tela. Alimenta o mapa de fechamentos por estado.
alter table public.clientes_fechados
  add column if not exists uf text;
