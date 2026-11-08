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
