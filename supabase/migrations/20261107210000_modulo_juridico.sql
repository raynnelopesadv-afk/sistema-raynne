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
