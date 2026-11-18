-- =====================================================================
-- INDICAÇÃO → CONTRATO AUTOMÁTICO
-- A indicação vira "Virou contrato" sozinha quando aparece em Contratos
-- Fechados (clientes_fechados) um contrato do mesmo cliente:
--   * mesmo telefone (DDD + 8 últimos dígitos, ignora 55 e o 9º dígito), ou
--   * mesmo nome (sem acento, maiúscula/minúscula e espaços extras).
-- Nome só parecido (similaridade >= 0,6) vira "possível contrato" para a
-- gestão confirmar com um clique.
-- Janela: contrato fechado de 7 dias antes até 180 dias depois da indicação.
-- Funciona nos dois sentidos: ao lançar a indicação e ao lançar o contrato.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

create extension if not exists pg_trgm;

alter table public.indicacoes add column if not exists contrato_id uuid references public.clientes_fechados(id) on delete set null;
alter table public.indicacoes add column if not exists contrato_sugerido_id uuid references public.clientes_fechados(id) on delete set null;
alter table public.indicacoes add column if not exists contrato_descartado_id uuid references public.clientes_fechados(id) on delete set null;
alter table public.indicacoes add column if not exists vinculo_automatico boolean not null default false;
create index if not exists ix_indicacoes_contrato on public.indicacoes (contrato_id);

-- Chaves de comparação
create or replace function public.ind_chave_nome(t text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(lower(translate(coalesce(t, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g')), '');
$$;

create or replace function public.ind_chave_tel(t text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(t, ''), '\D', '', 'g');
begin
  if length(d) >= 12 and left(d, 2) = '55' then d := substr(d, 3); end if;
  if length(d) < 10 then return null; end if;
  return left(d, 2) || right(d, 8);
end;
$$;

-- Melhor contrato para uma indicação (exato primeiro; senão o mais parecido)
create or replace function public.indicacao_achar_contrato(_id uuid, _nome text, _tel text, _data date, _descartado uuid)
returns table (contrato uuid, data_contrato date, exato boolean)
language sql stable security definer set search_path = public, extensions as $$
  with c as (
    select cf.id,
           coalesce(cf.data_fechamento::date, cf.fechado_em::date, cf.created_at::date) as dt,
           (public.ind_chave_tel(cf.telefone) is not null and public.ind_chave_tel(cf.telefone) = public.ind_chave_tel(_tel)) as bate_tel,
           (public.ind_chave_nome(cf.nome_cliente) is not null and public.ind_chave_nome(cf.nome_cliente) = public.ind_chave_nome(_nome)) as bate_nome,
           similarity(coalesce(public.ind_chave_nome(cf.nome_cliente), ''), coalesce(public.ind_chave_nome(_nome), '')) as sim
      from public.clientes_fechados cf
     where cf.status_qualificacao::text not in ('desqualificado', 'desistencia')
       and cf.id is distinct from _descartado
       and not exists (select 1 from public.indicacoes x where x.contrato_id = cf.id and x.id is distinct from _id)
  )
  select id, dt, (bate_tel or bate_nome)
    from c
   where dt between _data - 7 and _data + 180
     and (bate_tel or bate_nome or sim >= 0.6)
   order by (bate_tel or bate_nome) desc, bate_tel desc, sim desc, dt
   limit 1;
$$;

-- Trigger na indicação: roda depois da trava ("a_") e do valor padrão ("b_")
create or replace function public.indicacoes_vincular()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  -- Gestão desfez um "virou contrato" automático: não vincula de novo ao mesmo contrato
  if tg_op = 'UPDATE' and old.status = 'fechado' and new.status <> 'fechado' and old.contrato_id is not null then
    new.contrato_descartado_id := old.contrato_id;
    new.contrato_id := null;
    new.vinculo_automatico := false;
  end if;
  if new.status = 'fechado' then new.contrato_sugerido_id := null; end if;
  if new.status <> 'indicado' or new.contrato_id is not null then return new; end if;

  select * into r from public.indicacao_achar_contrato(new.id, new.cliente_nome, new.telefone, new.data_indicacao, new.contrato_descartado_id);
  if not found then
    new.contrato_sugerido_id := null;
  elsif r.exato then
    new.status := 'fechado';
    new.contrato_id := r.contrato;
    new.contrato_sugerido_id := null;
    new.vinculo_automatico := true;
    new.data_fechamento := greatest(r.data_contrato, new.data_indicacao);
  else
    new.contrato_sugerido_id := r.contrato;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_indicacoes_c_vincular on public.indicacoes;
create trigger trg_indicacoes_c_vincular before insert or update on public.indicacoes
  for each row execute function public.indicacoes_vincular();

-- Trigger no contrato: ao lançar/alterar um contrato, reavalia as indicações em aberto
create or replace function public.contratos_vincular_indicacoes()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.indicacoes i
     set atualizado_em = now()
   where i.status = 'indicado'
     and i.contrato_id is null
     and ((public.ind_chave_tel(i.telefone) is not null and public.ind_chave_tel(i.telefone) = public.ind_chave_tel(new.telefone))
          or public.ind_chave_nome(i.cliente_nome) = public.ind_chave_nome(new.nome_cliente)
          or similarity(coalesce(public.ind_chave_nome(i.cliente_nome), ''), coalesce(public.ind_chave_nome(new.nome_cliente), '')) >= 0.6);
  return null;
end;
$$;
drop trigger if exists trg_contratos_vincular_indicacoes on public.clientes_fechados;
create trigger trg_contratos_vincular_indicacoes
  after insert or update of nome_cliente, telefone, data_fechamento, status_qualificacao on public.clientes_fechados
  for each row execute function public.contratos_vincular_indicacoes();

-- Nomes dos contratos vinculados/sugeridos (só a gestão vê)
create or replace function public.indicacoes_contratos(_ids uuid[])
returns table (id uuid, nome_cliente text, telefone text, data_contrato date)
language sql stable security definer set search_path = public as $$
  select cf.id, cf.nome_cliente, cf.telefone, coalesce(cf.data_fechamento::date, cf.fechado_em::date, cf.created_at::date)
    from public.clientes_fechados cf
   where cf.id = any(_ids) and public.has_role(auth.uid(), 'gestor');
$$;
revoke execute on function public.indicacoes_contratos(uuid[]) from anon, public;
grant execute on function public.indicacoes_contratos(uuid[]) to authenticated;

-- Reavalia tudo o que já foi lançado
update public.indicacoes set atualizado_em = now() where status = 'indicado' and contrato_id is null;
