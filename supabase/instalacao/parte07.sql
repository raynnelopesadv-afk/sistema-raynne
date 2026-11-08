-- Instalação do banco — parte 7 de 8. Rodar em ordem no SQL Editor do Supabase.

-- ===== 20260713120000_comissao_configuravel.sql
-- =============================================================================
-- Comissionamento configurável por produto × nível × etapa
-- Baseado no Manual de Onboarding Comercial:
--   - Níveis de carreira (Entrada → Elite), atribuídos manualmente pelo gestor
--   - Cada produto define meta/mês e valor por contrato por nível e por etapa
--     (fechamento, protocolo, pagamento confirmado)
--   - Produtos podem ter variantes (ex.: 1 ou 2 plataformas) com valores próprios
--   - Piso de 50% da meta; 50–99% proporcional; fim de semana 1,5×
-- =============================================================================

-- 1) Níveis de carreira -------------------------------------------------------
create table if not exists public.career_levels (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem int not null,
  honorario_fixo numeric(12,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.career_levels enable row level security;

drop policy if exists "career_levels read" on public.career_levels;
create policy "career_levels read" on public.career_levels
  for select to authenticated using (true);

drop policy if exists "career_levels write gestor" on public.career_levels;
create policy "career_levels write gestor" on public.career_levels
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

insert into public.career_levels (nome, ordem, honorario_fixo)
select v.nome, v.ordem, v.fixo
from (values
  ('Entrada', 1, 2000),
  ('Nível 2', 2, 2500),
  ('Nível 3', 3, 3000),
  ('Nível 4', 4, 3500),
  ('Elite',   5, 4000)
) as v(nome, ordem, fixo)
where not exists (select 1 from public.career_levels cl where cl.nome = v.nome);

-- 2) Nível por closer ---------------------------------------------------------
alter table public.closers
  add column if not exists career_level_id uuid references public.career_levels(id) on delete set null;

-- 3) Variantes por produto (ex.: '1 plataforma', '2 plataformas') --------------
alter table public.products
  add column if not exists variantes text[] not null default '{}';

-- 4) Campos novos no contrato ---------------------------------------------------
alter table public.clientes_fechados
  add column if not exists variante text,
  add column if not exists data_pagamento_confirmado date;

-- 5) Meta mensal por produto × nível -------------------------------------------
create table if not exists public.product_metas (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  career_level_id uuid not null references public.career_levels(id) on delete cascade,
  meta_contratos int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, career_level_id)
);

alter table public.product_metas enable row level security;

drop policy if exists "product_metas read" on public.product_metas;
create policy "product_metas read" on public.product_metas
  for select to authenticated using (true);

drop policy if exists "product_metas write gestor" on public.product_metas;
create policy "product_metas write gestor" on public.product_metas
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- 6) Valor por contrato por produto × nível × etapa (× variante) ---------------
-- etapa: 'fechamento' (data_fechamento), 'protocolo' (data_protocolo),
--        'pagamento' (data_pagamento_confirmado)
-- variante null = valor padrão (aplica-se quando o contrato não tem variante
-- ou quando não há regra específica para a variante do contrato)
create table if not exists public.product_commission_stages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  career_level_id uuid not null references public.career_levels(id) on delete cascade,
  etapa text not null check (etapa in ('fechamento','protocolo','pagamento')),
  variante text,
  valor numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists product_commission_stages_uniq
  on public.product_commission_stages (product_id, career_level_id, etapa, coalesce(variante,''));

alter table public.product_commission_stages enable row level security;

drop policy if exists "pcs read" on public.product_commission_stages;
create policy "pcs read" on public.product_commission_stages
  for select to authenticated using (true);

drop policy if exists "pcs write gestor" on public.product_commission_stages;
create policy "pcs write gestor" on public.product_commission_stages
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));


-- ===== 20260714090000_lancamento_aberto.sql
-- Qualquer usuário autenticado pode lançar vendas (exceto o papel agência).
-- Edição e qualificação continuam restritas às policies existentes.

drop policy if exists "clientes insert own or staff" on public.clientes_fechados;
drop policy if exists "clientes insert vendas" on public.clientes_fechados;
drop policy if exists "clientes insert auth" on public.clientes_fechados;

create policy "clientes insert auth" on public.clientes_fechados
  for insert to authenticated
  with check (not public.is_agencia(auth.uid()));


-- ===== 20260715100000_bonificacao_recebimento.sql
-- =============================================================================
-- Bonificação por recebimento (ex.: estagiária que acompanha recebimentos)
--  - forma_recebimento no contrato: à vista ou parcelado
--    (no parcelado, a data de recebimento registrada é a da ÚLTIMA parcela)
--  - regras por beneficiário × produto × forma: valor fixo por contrato
--    ou % sobre o valor efetivamente recebido
-- =============================================================================

alter table public.clientes_fechados
  add column if not exists forma_recebimento text
    check (forma_recebimento in ('a_vista','parcelado'));

create table if not exists public.bonificacao_recebimento_regras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  forma text not null check (forma in ('a_vista','parcelado')),
  tipo text not null check (tipo in ('fixo','percentual')),
  valor numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, product_id, forma)
);

alter table public.bonificacao_recebimento_regras enable row level security;

drop policy if exists "bonif read" on public.bonificacao_recebimento_regras;
create policy "bonif read" on public.bonificacao_recebimento_regras
  for select to authenticated using (true);

drop policy if exists "bonif write gestor" on public.bonificacao_recebimento_regras;
create policy "bonif write gestor" on public.bonificacao_recebimento_regras
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));


-- ===== 20260716090000_honorarios_iniciais.sql
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


-- ===== 20260717090000_projecao_exito.sql
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


-- ===== 20260718090000_operacao_closers.sql
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


-- ===== 20260719090000_permissoes_usuario.sql
-- =============================================================================
-- Permissões por usuário (override do padrão do papel)
--   - O papel define o padrão; user_permissoes guarda apenas as exceções
--     (permitido = true libera, false bloqueia).
--   - tem_permissao(uid, chave) resolve: override > padrão do papel.
--   - Aplicada também nas policies (RLS) das ações críticas.
-- Chaves: lancar_venda, editar_pendentes, qualificar, editar_cpf,
--         sincronizar_meta, ver_faturamento, ver_comissoes, ver_meta_ads
-- =============================================================================

create table if not exists public.user_permissoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permissao text not null,
  permitido boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, permissao)
);

alter table public.user_permissoes enable row level security;

drop policy if exists "permissoes read" on public.user_permissoes;
create policy "permissoes read" on public.user_permissoes
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'gestor'));

drop policy if exists "permissoes write gestor" on public.user_permissoes;
create policy "permissoes write gestor" on public.user_permissoes
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- Resolve a permissão: override do usuário > padrão do papel
create or replace function public.tem_permissao(_user_id uuid, _chave text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select permitido from public.user_permissoes
      where user_id = _user_id and permissao = _chave),
    case _chave
      when 'lancar_venda'      then not public.is_agencia(_user_id)
      when 'editar_pendentes'  then public.is_gestor_or_operador(_user_id)
        or exists (select 1 from public.user_roles
                   where user_id = _user_id and role in ('sdr','closer','full_cycle'))
      when 'qualificar'        then public.is_gestor_or_operador(_user_id)
      when 'editar_cpf'        then public.has_role(_user_id,'gestor')
      when 'sincronizar_meta'  then public.has_role(_user_id,'gestor')
      when 'ver_faturamento'   then not public.is_agencia(_user_id)
      when 'ver_comissoes'     then not public.is_agencia(_user_id)
      when 'ver_meta_ads'      then true
      else false
    end
  );
$$;

-- Aplica nas policies das ações críticas -------------------------------------

-- Lançar venda
drop policy if exists "clientes insert auth" on public.clientes_fechados;
create policy "clientes insert auth" on public.clientes_fechados
  for insert to authenticated
  with check (public.tem_permissao(auth.uid(),'lancar_venda'));

-- Qualificar / protocolar / resultado (edição técnica)
drop policy if exists "clientes update qual" on public.clientes_fechados;
create policy "clientes update qual" on public.clientes_fechados
  for update to authenticated
  using (public.tem_permissao(auth.uid(),'qualificar'))
  with check (public.tem_permissao(auth.uid(),'qualificar'));


-- ===== 20260720090000_dedo_duro.sql
-- =============================================================================
-- "Dedo duro" — proteção anti-fraude de comissões
--   1. Datas de etapas já comissionadas (mês anterior ao atual) não podem ser
--      alteradas por ninguém além do gestor — trava no banco (trigger).
--   2. Fila de solicitações: alterações travadas e lançamentos duplicados
--      viram pedido com motivo, que só o gestor aprova/rejeita.
-- =============================================================================

-- 1) Fila de solicitações -----------------------------------------------------
create table if not exists public.solicitacoes_alteracao (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('alterar_data','novo_contrato_duplicado')),
  contrato_id uuid references public.clientes_fechados(id) on delete cascade,
  solicitante uuid not null references auth.users(id) on delete cascade,
  motivo text not null,
  payload jsonb not null default '{}',
  status text not null default 'pendente' check (status in ('pendente','aprovada','rejeitada')),
  resposta text,
  decidido_por uuid references auth.users(id),
  decidido_em timestamptz,
  created_at timestamptz not null default now()
);

alter table public.solicitacoes_alteracao enable row level security;

drop policy if exists "solicitacoes insert" on public.solicitacoes_alteracao;
create policy "solicitacoes insert" on public.solicitacoes_alteracao
  for insert to authenticated
  with check (solicitante = auth.uid());

drop policy if exists "solicitacoes read" on public.solicitacoes_alteracao;
create policy "solicitacoes read" on public.solicitacoes_alteracao
  for select to authenticated
  using (solicitante = auth.uid() or public.has_role(auth.uid(),'gestor'));

drop policy if exists "solicitacoes gestor update" on public.solicitacoes_alteracao;
create policy "solicitacoes gestor update" on public.solicitacoes_alteracao
  for update to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- 2) Trava de datas comissionadas ---------------------------------------------
-- Uma data está "comissionada" quando pertence a mês anterior ao atual
-- (a folha do mês fecha no 1º dia útil do mês seguinte).
create or replace function public.trava_datas_comissionadas()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _mes_atual date := date_trunc('month', now())::date;
begin
  -- gestor e processos internos (sem sessão) passam direto
  if _uid is null or public.has_role(_uid, 'gestor') then
    return new;
  end if;

  if old.data_fechamento is not null
     and date_trunc('month', old.data_fechamento)::date < _mes_atual
     and new.data_fechamento is distinct from old.data_fechamento then
    raise exception 'Data de fechamento de mês já comissionado. Envie uma solicitação ao gestor.';
  end if;

  if old.data_protocolo is not null
     and date_trunc('month', old.data_protocolo)::date < _mes_atual
     and new.data_protocolo is distinct from old.data_protocolo then
    raise exception 'Data de protocolo de mês já comissionado. Envie uma solicitação ao gestor.';
  end if;

  if old.data_pagamento_confirmado is not null
     and date_trunc('month', old.data_pagamento_confirmado)::date < _mes_atual
     and new.data_pagamento_confirmado is distinct from old.data_pagamento_confirmado then
    raise exception 'Data de pagamento de mês já comissionado. Envie uma solicitação ao gestor.';
  end if;

  if old.data_recebimento is not null
     and date_trunc('month', old.data_recebimento)::date < _mes_atual
     and new.data_recebimento is distinct from old.data_recebimento then
    raise exception 'Data de recebimento de mês já comissionado. Envie uma solicitação ao gestor.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_trava_datas_comissionadas on public.clientes_fechados;
create trigger trg_trava_datas_comissionadas
  before update of data_fechamento, data_protocolo, data_pagamento_confirmado, data_recebimento
  on public.clientes_fechados
  for each row execute function public.trava_datas_comissionadas();

-- 3) Realtime: o banco avisa o app quando há solicitação nova (sem polling)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'solicitacoes_alteracao'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitacoes_alteracao;
  END IF;
END $$;


-- ===== 20260721090000_fechamento_ia.sql
-- Fechamento por IA: o closer assume a venda, conta para a meta normalmente,
-- mas a parcela de comissão do FECHAMENTO só é liberada no mês do protocolo,
-- junto com a parcela de protocolo.
alter table public.clientes_fechados
  add column if not exists fechado_por_ia boolean not null default false;


-- ===== 20260722090000_celebracao_vendas.sql
-- Celebração de vendas no modo apresentação (TV)
--   - closers.foto_url: foto do vendedor exibida no telão de parabéns
--   - bucket 'avatars' para armazenar as fotos

alter table public.closers
  add column if not exists foto_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars read public" on storage.objects;
create policy "avatars read public" on storage.objects
  for select to public using (bucket_id = 'avatars');

drop policy if exists "avatars upload auth" on storage.objects;
create policy "avatars upload auth" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');

drop policy if exists "avatars update auth" on storage.objects;
create policy "avatars update auth" on storage.objects
  for update to authenticated using (bucket_id = 'avatars');


-- ===== 20260723090000_datacrazy_cache.sql
-- Cache do funil do Data Crazy (evita estourar o limite de 60 req/min da API).
create table if not exists public.datacrazy_funil_cache (
  chave text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.datacrazy_funil_cache enable row level security;

drop policy if exists "dc cache read" on public.datacrazy_funil_cache;
create policy "dc cache read" on public.datacrazy_funil_cache
  for select to authenticated using (true);
-- Escrita só pela função (service role bypassa RLS).


-- ===== 20260724090000_funil_classificacao.sql
-- Classificação das etapas do funil por pipe: quais etapas são "ganho" e
-- quais são "perdido" (o resto é neutro / em andamento). Cada pipe do Data
-- Crazy funciona diferente, então isso é configurável direto no BI.
create table if not exists public.funil_classificacao (
  pipeline_id text not null,
  stage_id text not null,
  tipo text not null check (tipo in ('ganho','perdido')),
  updated_at timestamptz not null default now(),
  primary key (pipeline_id, stage_id)
);
alter table public.funil_classificacao enable row level security;

drop policy if exists "funil_class read" on public.funil_classificacao;
create policy "funil_class read" on public.funil_classificacao
  for select to authenticated using (true);

drop policy if exists "funil_class write" on public.funil_classificacao;
create policy "funil_class write" on public.funil_classificacao
  for all to authenticated using (true) with check (true);


-- ===== 20260725090000_warm_funil_cache.sql
-- Atualizador automático do cache do funil (mantém a 1ª carga sempre rápida).
-- A cada 25 min chama a edge function com force=true para renovar o cache
-- (que dura 30 min), então o funil abre instantâneo para quem acessa.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  -- >>> TROQUE pela sua anon public key (Supabase → Project Settings → API → "anon public")
  _key text := 'SUA_ANON_KEY_AQUI';
  _url text := 'https://SEU_PROJECT_REF.supabase.co/functions/v1/funcao-datacrazy-funil-ts';
begin
  -- remove um job anterior com o mesmo nome (permite rodar de novo sem erro)
  if exists (select 1 from cron.job where jobname = 'warm-funil-cache') then
    perform cron.unschedule('warm-funil-cache');
  end if;

  if _key = 'SUA_ANON_KEY_AQUI' then
    raise notice 'Cole sua anon public key na variavel _key antes de rodar. Nada foi agendado.';
    return;
  end if;

  perform cron.schedule(
    'warm-funil-cache',
    '*/25 * * * *',
    format(
      'select net.http_post(url := %L, body := jsonb_build_object(''force'', true), headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer %s''));',
      _url, _key
    )
  );
  raise notice 'Job warm-funil-cache agendado (a cada 25 min).';
end $$;


-- ===== 20260726090000_produto_sku_variantes.sql
-- Produtos: SKU (para vínculo com o Data Crazy) e variantes com valor + SKU
-- próprios. Cada variante no DC é um produto com SKU; aqui o SKU mora na
-- variante (ou no produto, quando não há variante) e faz a ponte 1:1.
alter table public.products
  add column if not exists sku text,
  add column if not exists variantes_config jsonb not null default '[]'::jsonb;

comment on column public.products.sku is 'SKU do produto no Data Crazy (para produtos sem variante).';
comment on column public.products.variantes_config is 'Variantes com valor e SKU: [{"nome","valor","sku"}]. Os nomes espelham products.variantes.';


-- ===== 20260727090000_espelhamento_datacrazy.sql
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


-- ===== 20260728090000_solicitacao_exclusao.sql
-- Solicitação de EXCLUSÃO de fechamento: o usuário (não-gestor) pede a exclusão
-- com um motivo; o gestor aprova na fila de Solicitações e a venda é excluída.
alter table public.solicitacoes_alteracao drop constraint if exists solicitacoes_alteracao_tipo_check;
alter table public.solicitacoes_alteracao add constraint solicitacoes_alteracao_tipo_check
  check (tipo in ('alterar_data','novo_contrato_duplicado','excluir_contrato'));


-- ===== 20260729090000_origem_lead.sql
-- Origem do lead (canal de aquisição): Meta Ads, Google Ads, Indicação, etc.
-- Regra: todo fechamento nasce como 'meta_ads' (padrão), editável no lançamento.
alter table public.clientes_fechados
  add column if not exists origem_lead text not null default 'meta_ads';


-- ===== 20260730090000_uf_fechamento.sql
-- UF (estado) do fechamento. Preenchido automaticamente pelo DDD do telefone,
-- mas editável na tela. Alimenta o mapa de fechamentos por estado.
alter table public.clientes_fechados
  add column if not exists uf text;


-- ===== 20260731090000_parcelas_contrato.sql
-- Parcelas do contrato: valor, vencimento e pagamento (data + pago sim/não).
-- Fluxo: usuário registra cada parcela; ao marcar a ÚLTIMA como paga, o
-- sistema seta automaticamente data_recebimento = data do pagamento dessa
-- parcela e valor_honorarios_recebidos = soma das parcelas pagas.
-- Assim a comissão do "recebimento" (e a bonificação) dispara sem trabalho extra.

create table if not exists public.contrato_parcelas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.clientes_fechados(id) on delete cascade,
  numero int not null,                                -- 1, 2, 3...
  valor numeric(12,2) not null default 0,
  vencimento date,
  pago boolean not null default false,
  data_pagamento date,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contrato_id, numero)
);
alter table public.contrato_parcelas enable row level security;

drop policy if exists "parcelas read" on public.contrato_parcelas;
create policy "parcelas read" on public.contrato_parcelas
  for select to authenticated using (true);

-- Escrita liberada para autenticados; a trava anti-fraude fica no gestor via UI.
drop policy if exists "parcelas write" on public.contrato_parcelas;
create policy "parcelas write" on public.contrato_parcelas
  for all to authenticated using (true) with check (true);

-- Atualiza data_recebimento e valor_honorarios_recebidos no contrato conforme
-- as parcelas mudam. Se TODAS estiverem pagas, data_recebimento = maior
-- data_pagamento (data da quitação = da última parcela paga).
create or replace function public.sync_recebimento_por_parcelas()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _cid uuid := coalesce(new.contrato_id, old.contrato_id);
  _total int; _pagas int; _soma numeric; _ultima date;
begin
  if _cid is null then return coalesce(new, old); end if;
  select count(*), count(*) filter (where pago), coalesce(sum(valor) filter (where pago),0), max(data_pagamento) filter (where pago)
    into _total, _pagas, _soma, _ultima
    from public.contrato_parcelas where contrato_id = _cid;

  if _total = 0 then
    -- sem parcelas: não mexe (o registro manual continua valendo)
    return coalesce(new, old);
  end if;

  update public.clientes_fechados
     set valor_honorarios_recebidos = _soma,
         data_recebimento = case when _pagas = _total and _pagas > 0 then _ultima else null end,
         forma_recebimento = case when _total = 1 then 'a_vista' else 'parcelado' end
   where id = _cid;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_recebimento on public.contrato_parcelas;
create trigger trg_sync_recebimento
  after insert or update or delete on public.contrato_parcelas
  for each row execute function public.sync_recebimento_por_parcelas();


-- ===== 20260801090000_data_criacao_lead.sql
-- Data de criação do lead (entrada) — base para o tempo de ciclo de venda:
-- do momento em que o lead entrou até o fechamento. Vem do CRM (Data Crazy).
alter table public.clientes_fechados
  add column if not exists data_criacao_lead date;


-- ===== 20260802090000_estorno_comissao.sql
-- Estorno de comissão: quando um contrato vira DESQUALIFICADO ou DESISTÊNCIA,
-- o vendedor perde a comissão daquele contrato.
--   - Se ainda no mês da competência: a parcela simplesmente não é paga
--     (o motor já ignora contratos nesses status).
--   - Se em mês posterior: o valor já creditado vira DESCONTO no mês da
--     desqualificação.
-- Para isso precisamos saber QUANDO o contrato foi desqualificado.
-- O gatilho abaixo preenche data_desqualificacao automaticamente, qualquer
-- que seja a tela usada (Processos, edição do contrato, etc.).

create or replace function public.set_data_desqualificacao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status_qualificacao in ('desqualificado','desistencia')
     and (old.status_qualificacao is distinct from new.status_qualificacao) then
    new.data_desqualificacao := coalesce(new.data_desqualificacao, current_date);
  end if;
  -- voltou a ficar ativo: limpa a data (não há mais estorno)
  if new.status_qualificacao not in ('desqualificado','desistencia')
     and old.status_qualificacao in ('desqualificado','desistencia') then
    new.data_desqualificacao := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_data_desqualificacao on public.clientes_fechados;
create trigger trg_set_data_desqualificacao
  before update of status_qualificacao on public.clientes_fechados
  for each row execute function public.set_data_desqualificacao();

-- Preenche o histórico: contratos já desqualificados sem data recebem a data
-- da última atualização (melhor aproximação disponível).
update public.clientes_fechados
   set data_desqualificacao = updated_at::date
 where status_qualificacao in ('desqualificado','desistencia')
   and data_desqualificacao is null;

