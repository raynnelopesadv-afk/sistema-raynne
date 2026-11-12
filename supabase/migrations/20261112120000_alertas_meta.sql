-- =====================================================================
-- ALERTAS DE META NO CELULAR ("Vai, vencedor(a)!")
-- Cada pessoa cadastra o celular (tela "Meu celular") e recebe, de hora em
-- hora, como está a própria meta e quem da equipe está abaixo dela.
-- O envio é feito pelo GitHub Actions (.github/workflows/alertas-meta.yml).
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

-- Inscrição de cada pessoa (setor da meta e quais alertas quer receber)
create table if not exists public.alertas_inscricoes (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  nome text,
  setor_meta text not null check (setor_meta in ('comercial', 'lider', 'juridico', 'prazos', 'gestao')),
  celular text,
  alerta_hora boolean not null default true,
  alerta_equipe boolean not null default true,
  resumo_dia boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_alertas_insc_upd on public.alertas_inscricoes;
create trigger trg_alertas_insc_upd before update on public.alertas_inscricoes
  for each row execute function public.set_atualizado_em();

create or replace function public.alertas_preencher_nome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.nome is null or btrim(new.nome) = '' then
    new.nome := public.nome_usuario(new.user_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_alertas_insc_nome on public.alertas_inscricoes;
create trigger trg_alertas_insc_nome before insert or update on public.alertas_inscricoes
  for each row execute function public.alertas_preencher_nome();

-- Celulares/navegadores que recebem as notificações (uma pessoa pode ter mais de um)
create table if not exists public.alertas_dispositivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  falhas int not null default 0,
  ultimo_envio_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists ix_alertas_disp_user on public.alertas_dispositivos (user_id);

-- Histórico do que foi enviado (cada um vê o seu; a gestão vê tudo)
create table if not exists public.alertas_enviados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  corpo text not null,
  enviado_em timestamptz not null default now()
);
create index if not exists ix_alertas_env_user on public.alertas_enviados (user_id, enviado_em desc);

-- Chaves do envio (geradas pelo robô na primeira execução). Só o robô lê.
create table if not exists public.alertas_config (
  id int primary key default 1 check (id = 1),
  vapid_publica text not null,
  vapid_privada text not null,
  criado_em timestamptz not null default now()
);
alter table public.alertas_config enable row level security;
revoke all on public.alertas_config from anon, authenticated;

-- A chave pública pode ser lida por quem está logado (é pública por natureza)
create or replace function public.alertas_vapid_publica()
returns text language sql stable security definer set search_path = public as $$
  select vapid_publica from public.alertas_config where id = 1;
$$;
revoke execute on function public.alertas_vapid_publica() from anon, public;
grant execute on function public.alertas_vapid_publica() to authenticated;

-- Segurança
alter table public.alertas_inscricoes enable row level security;
drop policy if exists "alertas_insc leitura" on public.alertas_inscricoes;
create policy "alertas_insc leitura" on public.alertas_inscricoes for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'gestor'));
drop policy if exists "alertas_insc proprio" on public.alertas_inscricoes;
create policy "alertas_insc proprio" on public.alertas_inscricoes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.alertas_inscricoes to authenticated;

alter table public.alertas_dispositivos enable row level security;
drop policy if exists "alertas_disp proprio" on public.alertas_dispositivos;
create policy "alertas_disp proprio" on public.alertas_dispositivos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.alertas_dispositivos to authenticated;

alter table public.alertas_enviados enable row level security;
drop policy if exists "alertas_env leitura" on public.alertas_enviados;
create policy "alertas_env leitura" on public.alertas_enviados for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'gestor'));
grant select on public.alertas_enviados to authenticated;
