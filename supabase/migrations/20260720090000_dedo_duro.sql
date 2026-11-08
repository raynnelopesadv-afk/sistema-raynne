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
