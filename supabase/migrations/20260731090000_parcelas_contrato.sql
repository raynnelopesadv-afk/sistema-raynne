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
