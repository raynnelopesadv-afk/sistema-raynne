-- =====================================================================
-- COMISSÃO POR INDICAÇÃO
-- Cada colaborador lança os clientes que INDICOU (clientes de fora, não do
-- tráfego pago). A comissão do mês conta as indicações que viraram contrato.
-- Valor por indicação (regra da Dra. Raynne):
--   R$ 45 — auxílio-acidente, BPC/LOAS, aposentadoria, pensão por morte
--   R$ 40 — salário-maternidade, auxílio-doença
--   outros produtos: valor definido pela gestão no lançamento
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

create table if not exists public.indicacoes (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  indicador_nome text,
  cliente_nome text not null,
  telefone text,
  produto text not null,
  data_indicacao date not null default (now() at time zone 'America/Sao_Paulo')::date,
  status text not null default 'indicado' check (status in ('indicado','fechado','nao_fechou')),
  data_fechamento date,
  valor numeric(10,2),
  pago boolean not null default false,
  pago_em date,
  observacao text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- (re)cria a regra de produtos, incluindo pensão por morte
alter table public.indicacoes drop constraint if exists indicacoes_produto_check;
alter table public.indicacoes add constraint indicacoes_produto_check
  check (produto in ('auxilio_acidente','bpc','aposentadoria','pensao_morte','salario_maternidade','auxilio_doenca','outro'));
create index if not exists ix_indicacoes_indicador on public.indicacoes (indicador_id, data_indicacao desc);
create index if not exists ix_indicacoes_data on public.indicacoes (data_indicacao desc);

-- Valor padrão por produto
create or replace function public.indicacao_valor_padrao(_produto text)
returns numeric language sql immutable as $$
  select case _produto
    when 'auxilio_acidente' then 45 when 'bpc' then 45 when 'aposentadoria' then 45 when 'pensao_morte' then 45
    when 'salario_maternidade' then 40 when 'auxilio_doenca' then 40
    else 0 end::numeric;
$$;

create or replace function public.indicacoes_antes_gravar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.indicador_nome := coalesce(nullif(btrim(new.indicador_nome), ''), public.nome_usuario(new.indicador_id));
  if tg_op = 'INSERT' or new.produto is distinct from old.produto then
    if new.valor is null or (tg_op = 'UPDATE' and new.valor = public.indicacao_valor_padrao(old.produto)) then
      new.valor := public.indicacao_valor_padrao(new.produto);
    end if;
  end if;
  if new.status = 'fechado' and new.data_fechamento is null then
    new.data_fechamento := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  if new.status <> 'fechado' then new.data_fechamento := null; new.pago := false; end if;
  if new.pago and new.pago_em is null then new.pago_em := (now() at time zone 'America/Sao_Paulo')::date; end if;
  if not new.pago then new.pago_em := null; end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists trg_indicacoes_gravar on public.indicacoes;
drop trigger if exists trg_indicacoes_b_gravar on public.indicacoes;
create trigger trg_indicacoes_b_gravar before insert or update on public.indicacoes
  for each row execute function public.indicacoes_antes_gravar();

-- Só a gestão muda status, valor e pagamento; o colaborador só corrige os dados
-- da própria indicação enquanto ela ainda está como "indicado".
create or replace function public.indicacoes_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'gestor') then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'indicado'; new.pago := false; new.valor := null; new.indicador_id := auth.uid();
    return new;
  end if;
  if old.status <> 'indicado' then raise exception 'Indicação já analisada pela gestão: peça a alteração à Dra. Raynne.'; end if;
  if new.status is distinct from old.status or new.pago is distinct from old.pago
     or new.valor is distinct from old.valor or new.indicador_id is distinct from old.indicador_id then
    raise exception 'Só a gestão altera status, valor e pagamento da indicação.';
  end if;
  return new;
end;
$$;
-- ("a_" roda antes do "b_gravar": a trava vem primeiro, o valor padrão depois)
drop trigger if exists trg_indicacoes_a_proteger on public.indicacoes;
create trigger trg_indicacoes_a_proteger before insert or update on public.indicacoes
  for each row execute function public.indicacoes_proteger();

-- Segurança: cada um vê as próprias; a gestão vê e edita todas
alter table public.indicacoes enable row level security;
drop policy if exists "indicacoes leitura" on public.indicacoes;
create policy "indicacoes leitura" on public.indicacoes for select to authenticated
  using (indicador_id = auth.uid() or public.has_role(auth.uid(), 'gestor'));
drop policy if exists "indicacoes inserir" on public.indicacoes;
create policy "indicacoes inserir" on public.indicacoes for insert to authenticated
  with check (indicador_id = auth.uid() or public.has_role(auth.uid(), 'gestor'));
drop policy if exists "indicacoes editar" on public.indicacoes;
create policy "indicacoes editar" on public.indicacoes for update to authenticated
  using (indicador_id = auth.uid() or public.has_role(auth.uid(), 'gestor'))
  with check (indicador_id = auth.uid() or public.has_role(auth.uid(), 'gestor'));
drop policy if exists "indicacoes apagar" on public.indicacoes;
create policy "indicacoes apagar" on public.indicacoes for delete to authenticated
  using (public.has_role(auth.uid(), 'gestor') or (indicador_id = auth.uid() and status = 'indicado'));
grant select, insert, update, delete on public.indicacoes to authenticated;

-- Lista da equipe para a gestão escolher quem indicou (só nome)
create or replace function public.equipe_indicadores()
returns table (user_id uuid, nome text) language sql stable security definer set search_path = public as $$
  select distinct u.id, public.nome_usuario(u.id)
    from auth.users u
    join public.user_roles r on r.user_id = u.id
   where r.role::text <> 'agencia'
     and public.has_role(auth.uid(), 'gestor')
   order by 2;
$$;
revoke execute on function public.equipe_indicadores() from anon, public;
grant execute on function public.equipe_indicadores() to authenticated;
