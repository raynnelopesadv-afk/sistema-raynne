-- =====================================================================
-- TAREFAS POR SETOR (estilo Advbox)
-- Cada setor do escritório tem as suas tarefas: quem faz, prazo, prioridade,
-- cliente/processo, checklist, comentários e recorrência.
-- Ao concluir, a tarefa entra no histórico de ações da equipe (tela Equipe).
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

-- Nome amigável de um usuário (nunca o e-mail inteiro)
create or replace function public.nome_usuario(_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when coalesce(p.display_name, '') = '' or p.display_name like '%@%'
              then initcap(replace(replace(split_part(u.email, '@', 1), '.', ' '), '_', ' '))
              else p.display_name end
    from auth.users u left join public.profiles p on p.user_id = u.id
   where u.id = _uid;
$$;

-- ---------------------------------------------------------------------
-- SETORES
-- ---------------------------------------------------------------------
create table if not exists public.setores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text not null default '#0E7490',
  ordem int not null default 100,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

insert into public.setores (nome, cor, ordem) values
  ('Comercial',            '#D4A017', 10),
  ('Atendimento e Pós-venda', '#7C3AED', 20),
  ('Previdenciário',       '#0E7490', 30),
  ('Aéreo/Consumidor',     '#2563EB', 40),
  ('Protocolo',            '#15803D', 50),
  ('Financeiro',           '#B45309', 60),
  ('Marketing',            '#DB2777', 70),
  ('Administrativo',       '#6B7280', 80)
on conflict (nome) do nothing;

create table if not exists public.setor_membros (
  setor_id uuid not null references public.setores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (setor_id, user_id)
);
create index if not exists ix_setor_membros_user on public.setor_membros (user_id);

alter table public.setores enable row level security;
drop policy if exists "setores leitura" on public.setores;
create policy "setores leitura" on public.setores for select to authenticated
  using (public.acesso_juridico(auth.uid()));
drop policy if exists "setores gestor" on public.setores;
create policy "setores gestor" on public.setores for all to authenticated
  using (public.has_role(auth.uid(), 'gestor')) with check (public.has_role(auth.uid(), 'gestor'));

alter table public.setor_membros enable row level security;
drop policy if exists "setor_membros leitura" on public.setor_membros;
create policy "setor_membros leitura" on public.setor_membros for select to authenticated
  using (public.acesso_juridico(auth.uid()));
drop policy if exists "setor_membros gestor" on public.setor_membros;
create policy "setor_membros gestor" on public.setor_membros for all to authenticated
  using (public.has_role(auth.uid(), 'gestor')) with check (public.has_role(auth.uid(), 'gestor'));

-- ---------------------------------------------------------------------
-- TAREFAS
-- ---------------------------------------------------------------------
create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  setor_id uuid references public.setores(id) on delete set null,
  responsavel_id uuid references auth.users(id) on delete set null,   -- vazio = qualquer um do setor
  responsavel_nome text,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_por_nome text,
  prioridade text not null default 'normal' check (prioridade in ('baixa','normal','alta','urgente')),
  status text not null default 'a_fazer' check (status in ('a_fazer','fazendo','aguardando','concluida','cancelada')),
  prazo date,
  hora time,
  cliente_nome text,
  processo_numero text,
  checklist jsonb not null default '[]'::jsonb,                        -- [{ "texto": "...", "feito": false }]
  recorrencia text not null default 'nenhuma' check (recorrencia in ('nenhuma','diaria','semanal','mensal')),
  concluida_em timestamptz,
  concluida_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists ix_tarefas_setor on public.tarefas (setor_id, status);
create index if not exists ix_tarefas_resp on public.tarefas (responsavel_id, status);
create index if not exists ix_tarefas_prazo on public.tarefas (prazo) where status not in ('concluida','cancelada');

drop trigger if exists trg_tarefas_upd on public.tarefas;
create trigger trg_tarefas_upd before update on public.tarefas
  for each row execute function public.set_atualizado_em();

-- nomes e data de conclusão preenchidos sozinhos
create or replace function public.tarefas_preencher()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id then
    new.responsavel_nome := case when new.responsavel_id is null then null else public.nome_usuario(new.responsavel_id) end;
  end if;
  if tg_op = 'INSERT' then
    new.criado_por_nome := coalesce(nullif(new.criado_por_nome, ''), public.nome_usuario(new.criado_por));
  end if;
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    new.concluida_em := now();
    new.concluida_por := coalesce(auth.uid(), new.responsavel_id);
  elsif new.status <> 'concluida' then
    new.concluida_em := null;
    new.concluida_por := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_tarefas_preencher on public.tarefas;
create trigger trg_tarefas_preencher before insert or update on public.tarefas
  for each row execute function public.tarefas_preencher();

-- ao concluir: registra na produtividade da equipe e cria a próxima se for recorrente
create or replace function public.tarefas_ao_concluir()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prox date;
begin
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    insert into public.colaborador_acoes (usuario_id, usuario_nome, fonte, acao, entidade, entidade_id, descricao, em, chave)
    values (new.concluida_por, public.nome_usuario(new.concluida_por), 'sistema', 'concluiu_tarefa', 'tarefa', new.id::text,
            new.titulo || coalesce(' — ' || new.cliente_nome, ''), now(),
            'tarefa-' || new.id || '-' || extract(epoch from now())::bigint)
    on conflict (chave) do nothing;

    if new.recorrencia <> 'nenhuma' then
      prox := case new.recorrencia
                when 'diaria'  then coalesce(new.prazo, current_date) + 1
                when 'semanal' then coalesce(new.prazo, current_date) + 7
                when 'mensal'  then (coalesce(new.prazo, current_date) + interval '1 month')::date
              end;
      -- dia útil: sábado/domingo passam para segunda
      if extract(isodow from prox) = 6 then prox := prox + 2;
      elsif extract(isodow from prox) = 7 then prox := prox + 1; end if;
      insert into public.tarefas (titulo, descricao, setor_id, responsavel_id, criado_por, criado_por_nome, prioridade,
                                  prazo, hora, cliente_nome, processo_numero, checklist, recorrencia)
      values (new.titulo, new.descricao, new.setor_id, new.responsavel_id, new.criado_por, new.criado_por_nome, new.prioridade,
              prox, new.hora, new.cliente_nome, new.processo_numero,
              coalesce((select jsonb_agg(jsonb_set(e, '{feito}', 'false'::jsonb)) from jsonb_array_elements(new.checklist) e), '[]'::jsonb),
              new.recorrencia);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_tarefas_concluir on public.tarefas;
create trigger trg_tarefas_concluir after insert or update of status on public.tarefas
  for each row execute function public.tarefas_ao_concluir();

-- Segurança: a equipe liberada vê tudo e cria; edita quem é responsável, quem criou,
-- quem é do setor, ou o gestor; apaga quem criou ou o gestor.
drop function if exists public.pode_editar_tarefa(public.tarefas);
create or replace function public.pode_editar_tarefa(_setor uuid, _resp uuid, _criador uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'gestor')
      or _resp = auth.uid()
      or _criador = auth.uid()
      or _resp is null and _setor is null
      or exists (select 1 from public.setor_membros m where m.setor_id = _setor and m.user_id = auth.uid());
$$;

alter table public.tarefas enable row level security;
drop policy if exists "tarefas leitura" on public.tarefas;
create policy "tarefas leitura" on public.tarefas for select to authenticated
  using (public.acesso_juridico(auth.uid()));
drop policy if exists "tarefas inclusao" on public.tarefas;
create policy "tarefas inclusao" on public.tarefas for insert to authenticated
  with check (public.acesso_juridico(auth.uid()));
drop policy if exists "tarefas edicao" on public.tarefas;
create policy "tarefas edicao" on public.tarefas for update to authenticated
  using (public.pode_editar_tarefa(setor_id, responsavel_id, criado_por)) with check (public.acesso_juridico(auth.uid()));
drop policy if exists "tarefas exclusao" on public.tarefas;
create policy "tarefas exclusao" on public.tarefas for delete to authenticated
  using (criado_por = auth.uid() or public.has_role(auth.uid(), 'gestor'));

-- ---------------------------------------------------------------------
-- COMENTÁRIOS
-- ---------------------------------------------------------------------
create table if not exists public.tarefa_comentarios (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null default auth.uid(),
  autor_nome text,
  texto text not null,
  criado_em timestamptz not null default now()
);
create index if not exists ix_tarefa_coment on public.tarefa_comentarios (tarefa_id, criado_em);

create or replace function public.tarefa_coment_nome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.autor_nome := coalesce(nullif(new.autor_nome, ''), public.nome_usuario(new.autor_id));
  return new;
end;
$$;
drop trigger if exists trg_tarefa_coment_nome on public.tarefa_comentarios;
create trigger trg_tarefa_coment_nome before insert on public.tarefa_comentarios
  for each row execute function public.tarefa_coment_nome();

alter table public.tarefa_comentarios enable row level security;
drop policy if exists "coment leitura" on public.tarefa_comentarios;
create policy "coment leitura" on public.tarefa_comentarios for select to authenticated
  using (public.acesso_juridico(auth.uid()));
drop policy if exists "coment inclusao" on public.tarefa_comentarios;
create policy "coment inclusao" on public.tarefa_comentarios for insert to authenticated
  with check (public.acesso_juridico(auth.uid()) and autor_id = auth.uid());
drop policy if exists "coment exclusao" on public.tarefa_comentarios;
create policy "coment exclusao" on public.tarefa_comentarios for delete to authenticated
  using (autor_id = auth.uid() or public.has_role(auth.uid(), 'gestor'));

grant select, insert, update, delete on public.setores, public.setor_membros, public.tarefas, public.tarefa_comentarios to authenticated;
