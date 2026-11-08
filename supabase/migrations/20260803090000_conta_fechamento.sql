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
