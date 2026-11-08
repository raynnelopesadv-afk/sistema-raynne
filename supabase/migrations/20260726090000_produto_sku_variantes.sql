-- Produtos: SKU (para vínculo com o Data Crazy) e variantes com valor + SKU
-- próprios. Cada variante no DC é um produto com SKU; aqui o SKU mora na
-- variante (ou no produto, quando não há variante) e faz a ponte 1:1.
alter table public.products
  add column if not exists sku text,
  add column if not exists variantes_config jsonb not null default '[]'::jsonb;

comment on column public.products.sku is 'SKU do produto no Data Crazy (para produtos sem variante).';
comment on column public.products.variantes_config is 'Variantes com valor e SKU: [{"nome","valor","sku"}]. Os nomes espelham products.variantes.';
