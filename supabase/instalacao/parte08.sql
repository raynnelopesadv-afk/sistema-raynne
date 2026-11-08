-- Instalação do banco — parte 8 de 8. Rodar em ordem no SQL Editor do Supabase.

-- ===== 20260803090000_conta_fechamento.sql
-- Contrato desqualificado / com desistência NO MESMO MÊS do fechamento não
-- conta como fechamento para nenhuma finalidade (KPIs, metas, receita,
-- ranking, mapas). Se a saída for em mês posterior, o fechamento continua
-- válido no mês em que ocorreu — o que muda é a comissão, que é estornada.
--
-- Mantido por gatilho (coluna calculada não é aceita aqui: a expressão
-- envolve tipos enum/data que o Postgres não considera imutáveis).

alter table public.clientes_fechados
  add column if not exists conta_fechamento boolean not null default true;

-- Garante o registro da data de desqualificação (idempotente — pode já existir).
create or replace function public.set_data_desqualificacao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status_qualificacao in ('desqualificado','desistencia')
     and (old.status_qualificacao is distinct from new.status_qualificacao) then
    new.data_desqualificacao := coalesce(new.data_desqualificacao, current_date);
  end if;
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

-- Recalcula conta_fechamento. O nome começa com "trg_zz" de propósito: os
-- gatilhos disparam em ordem alfabética, então este roda DEPOIS do que
-- preenche a data de desqualificação.
create or replace function public.set_conta_fechamento()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.conta_fechamento := not (
    new.status_qualificacao in ('desqualificado','desistencia')
    and new.data_desqualificacao is not null
    and new.data_fechamento is not null
    and date_trunc('month', new.data_desqualificacao) = date_trunc('month', new.data_fechamento)
  );
  return new;
end;
$$;

drop trigger if exists trg_zz_conta_fechamento on public.clientes_fechados;
create trigger trg_zz_conta_fechamento
  before insert or update on public.clientes_fechados
  for each row execute function public.set_conta_fechamento();

-- Ajusta os contratos já existentes.
update public.clientes_fechados
   set conta_fechamento = false
 where status_qualificacao in ('desqualificado','desistencia')
   and data_desqualificacao is not null
   and data_fechamento is not null
   and date_trunc('month', data_desqualificacao) = date_trunc('month', data_fechamento)
   and conta_fechamento is distinct from false;

create index if not exists ix_clientes_conta_fechamento
  on public.clientes_fechados (divisao, conta_fechamento, data_fechamento);


-- ===== 20260804090000_campos_personalizados.sql
-- Campos personalizados por PRODUTO, preenchidos na ficha do processo.
-- Ex.: Salário Maternidade tem campos que Motorista/App não tem.
-- Tipos: texto, numero, data, select (lista suspensa) e multi (múltipla escolha).

create table if not exists public.product_campos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null,
  tipo text not null check (tipo in ('texto','numero','data','select','multi')),
  opcoes text[] not null default '{}',   -- usado em select/multi
  obrigatorio boolean not null default false,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.product_campos enable row level security;

drop policy if exists "product_campos read" on public.product_campos;
create policy "product_campos read" on public.product_campos
  for select to authenticated using (true);

drop policy if exists "product_campos gestor" on public.product_campos;
create policy "product_campos gestor" on public.product_campos
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- Valores preenchidos, por contrato: { "<campo_id>": valor }
alter table public.clientes_fechados
  add column if not exists campos_personalizados jsonb not null default '{}'::jsonb;

-- Visibilidade no kanban: por regra o campo aparece no card; o gestor decide
-- o que esconder (ícone de olho na configuração do produto).
alter table public.product_campos
  add column if not exists visivel_kanban boolean not null default true;


-- ===== 20260805090000_criacao_lead_timestamp.sql
-- Ciclo de venda com precisão de horas/minutos: além da data, guarda o
-- MOMENTO exato em que o lead entrou (vem do CRM). Assim o tempo até o
-- fechamento pode ser exibido como "43min", "2h 15min", "3 dias 6h".
alter table public.clientes_fechados
  add column if not exists criacao_lead_em timestamptz;

-- Preenche o que já existe (só temos a data; assume início do dia).
update public.clientes_fechados
   set criacao_lead_em = (data_criacao_lead::timestamp at time zone 'America/Sao_Paulo')
 where data_criacao_lead is not null and criacao_lead_em is null;


-- ===== 20260806090000_dc_lead_id.sql
-- Rastreabilidade: guarda o ID do lead no Data Crazy junto com o fechamento.
-- Permite conferir, a qualquer momento, se o CPF/telefone gravado aqui bate
-- com o que está no CRM hoje (e de qual lead exatamente veio o dado).
alter table public.clientes_fechados
  add column if not exists dc_lead_id text;


-- ===== 20260807090000_historico_alteracoes.sql
-- =====================================================================
-- HISTÓRICO DE ALTERAÇÕES dos contratos
-- Registra QUEM mudou, O QUÊ, DE QUAL valor PARA QUAL e QUANDO.
-- Cobre os campos sensíveis: CPF, nome, telefone, valor, produto, closer,
-- datas de etapa e status. Só o gestor lê.
-- =====================================================================

create table if not exists public.contrato_historico (
  id bigserial primary key,
  contrato_id uuid not null references public.clientes_fechados(id) on delete cascade,
  campo text not null,
  valor_antigo text,
  valor_novo text,
  alterado_por uuid,          -- auth.uid() de quem salvou (null = processo automático)
  alterado_em timestamptz not null default now()
);
create index if not exists ix_hist_contrato on public.contrato_historico (contrato_id, alterado_em desc);
create index if not exists ix_hist_data on public.contrato_historico (alterado_em desc);

alter table public.contrato_historico enable row level security;
drop policy if exists "historico gestor" on public.contrato_historico;
create policy "historico gestor" on public.contrato_historico
  for select to authenticated using (public.has_role(auth.uid(),'gestor'));

create or replace function public.registrar_historico_contrato()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _campos text[] := array[
    'nome_cliente','cpf','telefone','valor','product_id','closer_id','variante',
    'data_fechamento','data_protocolo','data_pagamento_confirmado','data_recebimento',
    'status_qualificacao','valor_exito','valor_honorarios_recebidos','uf','origem_lead'
  ];
  _c text;
  _old jsonb := to_jsonb(old);
  _new jsonb := to_jsonb(new);
  _va text; _vn text;
begin
  foreach _c in array _campos loop
    _va := _old ->> _c;
    _vn := _new ->> _c;
    if _va is distinct from _vn then
      insert into public.contrato_historico (contrato_id, campo, valor_antigo, valor_novo, alterado_por)
      values (new.id, _c, _va, _vn, _uid);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_historico_contrato on public.clientes_fechados;
create trigger trg_historico_contrato
  after update on public.clientes_fechados
  for each row execute function public.registrar_historico_contrato();


-- ===== 20260808090000_normaliza_cpf.sql
-- Regra permanente: CPF e telefone são guardados SEMPRE só com dígitos,
-- não importa de onde venham (tela, webhook do CRM, importação futura).
-- A formatação bonita é aplicada na exibição.

create or replace function public.normaliza_documentos()
returns trigger
language plpgsql as $$
begin
  if new.cpf is not null then
    new.cpf := nullif(regexp_replace(new.cpf, '\D', '', 'g'), '');
  end if;
  if new.telefone is not null then
    new.telefone := nullif(regexp_replace(new.telefone, '\D', '', 'g'), '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normaliza_documentos on public.clientes_fechados;
create trigger trg_normaliza_documentos
  before insert or update of cpf, telefone on public.clientes_fechados
  for each row execute function public.normaliza_documentos();

-- Padroniza o que já existe (idempotente).
update public.clientes_fechados
   set cpf = regexp_replace(cpf, '\D', '', 'g')
 where cpf is not null and cpf ~ '[^0-9]';

update public.clientes_fechados
   set telefone = regexp_replace(telefone, '\D', '', 'g')
 where telefone is not null and telefone ~ '[^0-9]';


-- ===== 20261107210000_modulo_juridico.sql
-- =====================================================================
-- MÓDULO JURÍDICO — Raynne Lopes Advocacia
-- Publicações (DJEN + Tramitação Inteligente), agenda jurídica (prazos,
-- audiências, perícias), requerimentos do INSS (e-mails noreply@inss.gov.br)
-- e registro de ações por colaborador.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

-- ---------- PUBLICAÇÕES ----------
create table if not exists public.publicacoes (
  id uuid primary key default gen_random_uuid(),
  fonte text not null check (fonte in ('djen','tramitacao','manual')),
  id_externo text not null,                       -- id no DJEN / na Tramitação
  data_disponibilizacao date,
  inicio_prazo date,
  tribunal text,
  uf text,
  orgao text,
  numero_processo text,
  numero_processo_digitos text generated always as (regexp_replace(coalesce(numero_processo,''),'\D','','g')) stored,
  tipo_comunicacao text,
  tipo_documento text,
  classe text,
  texto text,
  link text,
  status text not null default 'nao_lida' check (status in ('nao_lida','tratada','arquivada')),
  responsavel_id uuid references auth.users(id) on delete set null,
  tratado_por uuid references auth.users(id) on delete set null,
  tratado_em timestamptz,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (fonte, id_externo)
);
create index if not exists ix_pub_data on public.publicacoes (data_disponibilizacao desc);
create index if not exists ix_pub_status on public.publicacoes (status);
create index if not exists ix_pub_proc on public.publicacoes (numero_processo_digitos);
create index if not exists ix_pub_uf on public.publicacoes (uf);

-- ---------- AGENDA JURÍDICA (prazos, audiências, perícias, tarefas) ----------
create table if not exists public.agenda_juridica (
  id uuid primary key default gen_random_uuid(),
  fonte text not null check (fonte in ('tramitacao','google_agenda','inss','manual')),
  id_externo text,
  tipo text not null default 'prazo'
    check (tipo in ('prazo','audiencia','pericia','tarefa','reuniao','despacho','exigencia_inss','evento')),
  titulo text not null,
  data date not null,
  hora time,
  numero_processo text,
  cliente text,
  local text,
  responsavel_nome text,
  responsavel_id uuid references auth.users(id) on delete set null,
  concluido boolean not null default false,
  concluido_por uuid references auth.users(id) on delete set null,
  concluido_em timestamptz,
  link text,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists ux_agenda_externo on public.agenda_juridica (fonte, id_externo) where id_externo is not null;
create index if not exists ix_agenda_data on public.agenda_juridica (data);
create index if not exists ix_agenda_tipo on public.agenda_juridica (tipo, concluido);

-- ---------- REQUERIMENTOS INSS ----------
create table if not exists public.inss_requerimentos (
  id uuid primary key default gen_random_uuid(),
  protocolo text not null unique,
  cliente text,
  servico text,
  data_protocolo date,
  unidade text,
  status text,                                    -- PENDENTE, EM ANÁLISE, CONCLUÍDA...
  despacho text,
  ultimo_aviso_em timestamptz,                    -- data do e-mail mais recente
  prazo_exigencia date,                           -- estimado: aviso + 30 dias corridos
  exigencia_automatica boolean not null default false, -- "o sistema cumpriu a exigência de forma automática"
  cumprido boolean not null default false,
  cumprido_por uuid references auth.users(id) on delete set null,
  cumprido_em timestamptz,
  responsavel_id uuid references auth.users(id) on delete set null,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists ix_inss_status on public.inss_requerimentos (status, cumprido);
create index if not exists ix_inss_prazo on public.inss_requerimentos (prazo_exigencia);

create table if not exists public.inss_avisos (
  id uuid primary key default gen_random_uuid(),
  email_id text not null unique,                  -- internetMessageId do e-mail
  protocolo text not null,
  status text,
  despacho text,
  recebido_em timestamptz not null,
  criado_em timestamptz not null default now()
);
create index if not exists ix_inss_avisos_prot on public.inss_avisos (protocolo, recebido_em desc);

-- ---------- AÇÕES POR COLABORADOR ----------
create table if not exists public.colaborador_acoes (
  id bigserial primary key,
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_nome text,                              -- quando vem da Tramitação (nome do membro)
  fonte text not null default 'sistema',          -- sistema | tramitacao
  acao text not null,                             -- ex.: tratou_publicacao, concluiu_prazo, cumpriu_exigencia
  entidade text,
  entidade_id text,
  descricao text,
  em timestamptz not null default now(),
  chave text                                      -- evita duplicar ações importadas
);
alter table public.colaborador_acoes add column if not exists chave text;
create unique index if not exists ux_acoes_chave on public.colaborador_acoes (chave);
create index if not exists ix_acoes_em on public.colaborador_acoes (em desc);
create index if not exists ix_acoes_usuario on public.colaborador_acoes (usuario_id, em desc);

-- ---------- LOG DE SINCRONIZAÇÃO ----------
create table if not exists public.sync_juridico (
  id bigserial primary key,
  fonte text not null,
  iniciado_em timestamptz not null default now(),
  inseridos int default 0,
  atualizados int default 0,
  erro text
);

-- ---------- updated_at ----------
create or replace function public.set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['publicacoes','agenda_juridica','inss_requerimentos'] loop
    execute format('drop trigger if exists trg_%1$s_upd on public.%1$s', t);
    execute format('create trigger trg_%1$s_upd before update on public.%1$s
                    for each row execute function public.set_atualizado_em()', t);
  end loop;
end $$;

-- ---------- REGISTRO AUTOMÁTICO DE AÇÕES ----------
-- Toda vez que alguém (logado) trata uma publicação, conclui um item da agenda
-- ou marca uma exigência do INSS como cumprida, fica registrado quem e quando.
create or replace function public.registrar_acao_juridica()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _nome text;
begin
  if _uid is null then
    return new; -- importações automáticas não contam como ação de colaborador
  end if;
  select coalesce(p.display_name, u.email) into _nome
    from auth.users u left join public.profiles p on p.user_id = u.id
   where u.id = _uid;

  if tg_table_name = 'publicacoes' then
   if new.status is distinct from old.status then
    if new.status = 'tratada' then
      new.tratado_por := _uid; new.tratado_em := now();
    end if;
    insert into public.colaborador_acoes (usuario_id, usuario_nome, acao, entidade, entidade_id, descricao)
    values (_uid, _nome, 'publicacao_' || new.status, 'publicacao', new.id::text,
            coalesce(new.tribunal,'') || ' ' || coalesce(new.numero_processo,''));
   end if;
  elsif tg_table_name = 'agenda_juridica' then
   if new.concluido is distinct from old.concluido then
    if new.concluido then new.concluido_por := _uid; new.concluido_em := now(); end if;
    insert into public.colaborador_acoes (usuario_id, usuario_nome, acao, entidade, entidade_id, descricao)
    values (_uid, _nome, case when new.concluido then 'concluiu_' else 'reabriu_' end || new.tipo,
            'agenda', new.id::text, new.titulo);
   end if;
  elsif tg_table_name = 'inss_requerimentos' then
   if new.cumprido is distinct from old.cumprido then
    if new.cumprido then new.cumprido_por := _uid; new.cumprido_em := now(); end if;
    insert into public.colaborador_acoes (usuario_id, usuario_nome, acao, entidade, entidade_id, descricao)
    values (_uid, _nome, case when new.cumprido then 'cumpriu_exigencia_inss' else 'reabriu_exigencia_inss' end,
            'inss', new.protocolo, coalesce(new.cliente,'') || ' — ' || coalesce(new.servico,''));
   end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['publicacoes','agenda_juridica','inss_requerimentos'] loop
    execute format('drop trigger if exists trg_%1$s_acao on public.%1$s', t);
    execute format('create trigger trg_%1$s_acao before update on public.%1$s
                    for each row execute function public.registrar_acao_juridica()', t);
  end loop;
end $$;

-- ---------- SEGURANÇA (RLS) ----------
-- Só quem o gestor liberou (papel diferente de "usuario" comum e de "agencia")
-- enxerga o módulo jurídico. Quem se cadastrar sozinho pela tela de login NÃO vê nada
-- até o gestor definir o papel em Config → Usuários. Só o gestor apaga.
-- As importações automáticas usam a service_role (ignora RLS).
create or replace function public.acesso_juridico(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
     where user_id = _uid
       and role::text in ('gestor','operador_tecnico','sdr','closer','full_cycle')
  );
$$;

do $$
declare t text;
begin
  foreach t in array array['publicacoes','agenda_juridica','inss_requerimentos','inss_avisos','colaborador_acoes','sync_juridico'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s leitura" on public.%1$s', t);
    execute format('create policy "%1$s leitura" on public.%1$s for select to authenticated using (public.acesso_juridico(auth.uid()))', t);
  end loop;
  foreach t in array array['publicacoes','agenda_juridica','inss_requerimentos'] loop
    execute format('drop policy if exists "%1$s edicao" on public.%1$s', t);
    execute format('create policy "%1$s edicao" on public.%1$s for update to authenticated using (public.acesso_juridico(auth.uid())) with check (public.acesso_juridico(auth.uid()))', t);
    execute format('drop policy if exists "%1$s inclusao" on public.%1$s', t);
    execute format('create policy "%1$s inclusao" on public.%1$s for insert to authenticated with check (public.acesso_juridico(auth.uid()))', t);
    execute format('drop policy if exists "%1$s exclusao" on public.%1$s', t);
    execute format('create policy "%1$s exclusao" on public.%1$s for delete to authenticated using (public.has_role(auth.uid(),''gestor''))', t);
  end loop;
end $$;

