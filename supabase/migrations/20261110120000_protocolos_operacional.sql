-- =====================================================================
-- PROTOCOLOS DO OPERACIONAL — cada colaborador registra o que protocolou no dia
-- (requerimento administrativo, ação judicial, recurso, petição etc.)
-- Base do painel de produtividade diária do setor operacional.
-- =====================================================================
create table if not exists public.protocolos_operacional (
  id uuid primary key default gen_random_uuid(),
  data date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  colaborador_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  colaborador_nome text,
  tipo text not null check (tipo in (
    'requerimento_adm', 'acao_judicial', 'recurso_adm', 'recurso_judicial',
    'peticao', 'cumprimento_exigencia', 'outro')),
  area text,                       -- previdenciario, aereo, civel, trabalhista...
  cliente_nome text not null,
  beneficio text,                  -- BPC, auxílio-acidente, maternidade, atraso de voo...
  numero text,                     -- nº do protocolo INSS ou do processo
  orgao text,                      -- INSS, TJMG, JEF, JEC...
  descricao text,                  -- o que foi feito
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists ix_protop_data on public.protocolos_operacional (data desc);
create index if not exists ix_protop_colab on public.protocolos_operacional (colaborador_id, data desc);

drop trigger if exists trg_protop_upd on public.protocolos_operacional;
create trigger trg_protop_upd before update on public.protocolos_operacional
  for each row execute function public.set_atualizado_em();

-- nome do colaborador preenchido sozinho
create or replace function public.protop_preencher_nome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.colaborador_nome is null or new.colaborador_nome = '' then
    select case when coalesce(p.display_name, '') = '' or p.display_name like '%@%'
                then initcap(replace(replace(split_part(u.email, '@', 1), '.', ' '), '_', ' '))
                else p.display_name end
      into new.colaborador_nome
      from auth.users u left join public.profiles p on p.user_id = u.id
     where u.id = new.colaborador_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protop_nome on public.protocolos_operacional;
create trigger trg_protop_nome before insert or update of colaborador_id on public.protocolos_operacional
  for each row execute function public.protop_preencher_nome();

-- cada protocolo também entra no histórico de ações da equipe
create or replace function public.protop_registrar_acao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.colaborador_acoes (usuario_id, usuario_nome, fonte, acao, entidade, entidade_id, descricao, em, chave)
  values (new.colaborador_id, new.colaborador_nome, 'sistema', 'protocolou_' || new.tipo, 'protocolo', new.id::text,
          new.cliente_nome || coalesce(' — ' || new.beneficio, '') || coalesce(' (' || new.numero || ')', ''),
          (new.data::timestamp + time '12:00') at time zone 'America/Sao_Paulo', 'protop-' || new.id)
  on conflict (chave) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_protop_acao on public.protocolos_operacional;
create trigger trg_protop_acao after insert on public.protocolos_operacional
  for each row execute function public.protop_registrar_acao();

create or replace function public.protop_apagar_acao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.colaborador_acoes where chave = 'protop-' || old.id;
  return old;
end;
$$;
drop trigger if exists trg_protop_del on public.protocolos_operacional;
create trigger trg_protop_del after delete on public.protocolos_operacional
  for each row execute function public.protop_apagar_acao();

-- Segurança: toda a equipe liberada vê; cada um lança e corrige os seus; o gestor mexe em todos.
alter table public.protocolos_operacional enable row level security;
drop policy if exists "protop leitura" on public.protocolos_operacional;
create policy "protop leitura" on public.protocolos_operacional for select to authenticated
  using (public.acesso_juridico(auth.uid()));
drop policy if exists "protop inclusao" on public.protocolos_operacional;
create policy "protop inclusao" on public.protocolos_operacional for insert to authenticated
  with check (public.acesso_juridico(auth.uid())
              and (colaborador_id = auth.uid() or public.has_role(auth.uid(), 'gestor')));
drop policy if exists "protop edicao" on public.protocolos_operacional;
create policy "protop edicao" on public.protocolos_operacional for update to authenticated
  using (colaborador_id = auth.uid() or public.has_role(auth.uid(), 'gestor'))
  with check (colaborador_id = auth.uid() or public.has_role(auth.uid(), 'gestor'));
drop policy if exists "protop exclusao" on public.protocolos_operacional;
create policy "protop exclusao" on public.protocolos_operacional for delete to authenticated
  using (colaborador_id = auth.uid() or public.has_role(auth.uid(), 'gestor'));

-- Meta diária de protocolos por colaborador (editável pelo gestor na tela)
insert into public.config (divisao, chave, valor)
select 'advogados', 'meta_protocolos_dia', '{"meta": 5}'::jsonb
where not exists (select 1 from public.config where divisao = 'advogados' and chave = 'meta_protocolos_dia');

-- Lista de colaboradores para escolher na tela (só nome, sem e-mail)
create or replace function public.colaboradores_juridico()
returns table (user_id uuid, nome text) language sql stable security definer set search_path = public as $$
  select distinct u.id, coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1))
    from auth.users u
    join public.user_roles r on r.user_id = u.id
    left join public.profiles p on p.user_id = u.id
   where r.role::text in ('gestor','operador_tecnico','sdr','closer','full_cycle')
     and public.acesso_juridico(auth.uid())
   order by 2;
$$;
grant execute on function public.colaboradores_juridico() to authenticated;
