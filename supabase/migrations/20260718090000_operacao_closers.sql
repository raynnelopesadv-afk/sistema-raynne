-- =============================================================================
-- Operação do closer (exclusivo vs misto) + bônus de combo
--   - closers.operacao_product_ids: produtos que o closer opera.
--     Vazio = sem operação definida (comporta-se como hoje).
--     1 produto = exclusivo (metas cheias).
--     2+ produtos = MISTO: meta de cada produto reduzida em 1/3 (arredonda
--     para baixo), conforme o Manual de Onboarding (seção 5.4).
--   - career_levels.bonus_combo: bônus pago ao misto que bate as metas
--     mistas de TODOS os produtos da sua operação no mês.
-- =============================================================================

alter table public.closers
  add column if not exists operacao_product_ids uuid[] not null default '{}';

alter table public.career_levels
  add column if not exists bonus_combo numeric(12,2) not null default 0;

-- Valores do manual (só aplica se ainda estiver zerado)
update public.career_levels set bonus_combo = 100  where nome = 'Entrada' and bonus_combo = 0;
update public.career_levels set bonus_combo = 300  where nome = 'Nível 2' and bonus_combo = 0;
update public.career_levels set bonus_combo = 500  where nome = 'Nível 3' and bonus_combo = 0;
update public.career_levels set bonus_combo = 800  where nome = 'Nível 4' and bonus_combo = 0;
update public.career_levels set bonus_combo = 1200 where nome = 'Elite'   and bonus_combo = 0;

-- Exemplos: Ana vira mista (AMEA + UBER), Beto exclusivo AMEA
update public.closers c
set operacao_product_ids = (
  select coalesce(array_agg(p.id), '{}') from public.products p
  where p.nome in ('[EXEMPLO] AMEA / BPC', '[EXEMPLO] UBER / APPs')
)
where c.nome = '[EXEMPLO] Ana Closer';

update public.closers c
set operacao_product_ids = (
  select coalesce(array_agg(p.id), '{}') from public.products p
  where p.nome = '[EXEMPLO] AMEA / BPC'
)
where c.nome = '[EXEMPLO] Beto Closer';
