-- =========================================================
-- BI Suite - Schema completo do zero
-- =========================================================

-- ENUMs ---------------------------------------------------------------
create type public.app_role as enum ('gestor','usuario','operador_tecnico');
create type public.divisao as enum ('advogados','educacao');
create type public.cliente_status as enum ('pendente','qualificado','desqualificado');
create type public.etapa_processo as enum ('aguardando','entrada','judicial','administrativo','fundo_investimento');
create type public.processo_status as enum ('em_andamento','vendido');
create type public.processo_tipo as enum ('judicial','administrativo');

-- Função utilitária de updated_at -------------------------------------
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- 1) profiles + user_roles -------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

create or replace function public.is_gestor_or_operador(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles
    where user_id=_user_id and role in ('gestor','operador_tecnico'))
$$;

-- trigger: cria profile + role 'usuario' ao cadastrar usuário ---------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  insert into public.user_roles (user_id, role) values (new.id, 'usuario');
  return new;
end; $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Policies profiles/user_roles ---------------------------------------
create policy "profiles read all auth"  on public.profiles for select to authenticated using (true);
create policy "profiles self update"    on public.profiles for update to authenticated using (user_id=auth.uid());
create policy "profiles gestor manage"  on public.profiles for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

create policy "user_roles self read"   on public.user_roles for select to authenticated
  using (user_id=auth.uid() or public.has_role(auth.uid(),'gestor'));
create policy "user_roles gestor all"  on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- 2) squads -----------------------------------------------------------
create table public.squads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  motto text,
  bandeira_url text,
  meta_mensal int not null default 0,
  divisao public.divisao not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.squads enable row level security;
create trigger trg_squads_updated before update on public.squads
for each row execute function public.update_updated_at_column();

create policy "squads read"       on public.squads for select to authenticated using (true);
create policy "squads gestor all" on public.squads for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- 3) closers ----------------------------------------------------------
create table public.closers (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  divisao public.divisao not null,
  squad_id uuid references public.squads(id) on delete set null,
  filial text,
  meta_mes int not null default 0,
  meta_dia int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.closers enable row level security;
create trigger trg_closers_updated before update on public.closers
for each row execute function public.update_updated_at_column();

create policy "closers read"       on public.closers for select to authenticated using (true);
create policy "closers gestor all" on public.closers for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- 4) products ---------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  short text,
  tipo text,
  valor numeric(12,2) not null default 0,
  ticket_medio numeric(12,2) not null default 0,
  ativo boolean not null default true,
  divisao public.divisao not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
create trigger trg_products_updated before update on public.products
for each row execute function public.update_updated_at_column();

create policy "products read"       on public.products for select to authenticated using (true);
create policy "products gestor all" on public.products for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- 5) config -----------------------------------------------------------
create table public.config (
  id uuid primary key default gen_random_uuid(),
  divisao public.divisao not null,
  chave text,
  valor jsonb,
  meta_mensal numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.config enable row level security;
create trigger trg_config_updated before update on public.config
for each row execute function public.update_updated_at_column();

create policy "config read"       on public.config for select to authenticated using (true);
create policy "config gestor all" on public.config for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- 6) clientes_fechados -----------------------------------------------
create table public.clientes_fechados (
  id uuid primary key default gen_random_uuid(),
  nome_cliente text not null,
  telefone text,
  cpf text,
  valor numeric(12,2) not null default 0,
  divisao public.divisao not null,
  closer_id uuid references public.closers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  filial text,
  status_qualificacao public.cliente_status not null default 'pendente',
  etapa_processo public.etapa_processo not null default 'aguardando',
  data_fechamento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clientes_fechados enable row level security;
create trigger trg_clientes_updated before update on public.clientes_fechados
for each row execute function public.update_updated_at_column();

create policy "clientes read"        on public.clientes_fechados for select to authenticated using (true);
create policy "clientes insert auth" on public.clientes_fechados for insert to authenticated with check (true);
create policy "clientes update qual" on public.clientes_fechados for update to authenticated
  using (public.is_gestor_or_operador(auth.uid()))
  with check (public.is_gestor_or_operador(auth.uid()));
create policy "clientes gestor del"  on public.clientes_fechados for delete to authenticated
  using (public.has_role(auth.uid(),'gestor'));

-- 7) vendas -----------------------------------------------------------
create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes_fechados(id) on delete set null,
  closer_id uuid references public.closers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  divisao public.divisao not null,
  valor_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vendas enable row level security;
create trigger trg_vendas_updated before update on public.vendas
for each row execute function public.update_updated_at_column();

create policy "vendas read"        on public.vendas for select to authenticated using (true);
create policy "vendas insert auth" on public.vendas for insert to authenticated with check (true);
create policy "vendas gestor mod"  on public.vendas for update to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));
create policy "vendas gestor del"  on public.vendas for delete to authenticated
  using (public.has_role(auth.uid(),'gestor'));

-- 8) agendamentos -----------------------------------------------------
create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  nome_cliente text not null,
  telefone text,
  divisao public.divisao not null,
  closer_id uuid references public.closers(id) on delete set null,
  data_agendamento timestamptz not null,
  status text default 'agendado',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agendamentos enable row level security;
create trigger trg_agend_updated before update on public.agendamentos
for each row execute function public.update_updated_at_column();

create policy "agend read"        on public.agendamentos for select to authenticated using (true);
create policy "agend insert auth" on public.agendamentos for insert to authenticated with check (true);
create policy "agend update auth" on public.agendamentos for update to authenticated using (true);
create policy "agend gestor del"  on public.agendamentos for delete to authenticated
  using (public.has_role(auth.uid(),'gestor'));

-- 9) processos --------------------------------------------------------
create table public.processos (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  tipo public.processo_tipo not null default 'judicial',
  status public.processo_status not null default 'em_andamento',
  valor numeric(12,2) not null default 0,
  closer_id uuid references public.closers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  cliente_id uuid references public.clientes_fechados(id) on delete set null,
  divisao public.divisao not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.processos enable row level security;
create trigger trg_processos_updated before update on public.processos
for each row execute function public.update_updated_at_column();

create policy "processos read"     on public.processos for select to authenticated using (true);
create policy "processos op write" on public.processos for all to authenticated
  using (public.is_gestor_or_operador(auth.uid()))
  with check (public.is_gestor_or_operador(auth.uid()));

-- 10) faturamento_mensal ---------------------------------------------
create table public.faturamento_mensal (
  id uuid primary key default gen_random_uuid(),
  divisao public.divisao not null,
  ano int not null,
  mes int not null,
  valor numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (divisao, ano, mes)
);
alter table public.faturamento_mensal enable row level security;
create trigger trg_fat_updated before update on public.faturamento_mensal
for each row execute function public.update_updated_at_column();

create policy "fat read"       on public.faturamento_mensal for select to authenticated using (true);
create policy "fat gestor all" on public.faturamento_mensal for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- 11) Storage bucket squad-flags -------------------------------------
insert into storage.buckets (id, name, public) values ('squad-flags','squad-flags', true);

create policy "squad-flags read public" on storage.objects
  for select to public using (bucket_id='squad-flags');
create policy "squad-flags gestor all" on storage.objects
  for all to authenticated
  using (bucket_id='squad-flags' and public.has_role(auth.uid(),'gestor'))
  with check (bucket_id='squad-flags' and public.has_role(auth.uid(),'gestor'));

