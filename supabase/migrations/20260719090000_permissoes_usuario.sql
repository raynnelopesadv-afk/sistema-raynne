-- =============================================================================
-- Permissões por usuário (override do padrão do papel)
--   - O papel define o padrão; user_permissoes guarda apenas as exceções
--     (permitido = true libera, false bloqueia).
--   - tem_permissao(uid, chave) resolve: override > padrão do papel.
--   - Aplicada também nas policies (RLS) das ações críticas.
-- Chaves: lancar_venda, editar_pendentes, qualificar, editar_cpf,
--         sincronizar_meta, ver_faturamento, ver_comissoes, ver_meta_ads
-- =============================================================================

create table if not exists public.user_permissoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permissao text not null,
  permitido boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, permissao)
);

alter table public.user_permissoes enable row level security;

drop policy if exists "permissoes read" on public.user_permissoes;
create policy "permissoes read" on public.user_permissoes
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'gestor'));

drop policy if exists "permissoes write gestor" on public.user_permissoes;
create policy "permissoes write gestor" on public.user_permissoes
  for all to authenticated
  using (public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'gestor'));

-- Resolve a permissão: override do usuário > padrão do papel
create or replace function public.tem_permissao(_user_id uuid, _chave text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select permitido from public.user_permissoes
      where user_id = _user_id and permissao = _chave),
    case _chave
      when 'lancar_venda'      then not public.is_agencia(_user_id)
      when 'editar_pendentes'  then public.is_gestor_or_operador(_user_id)
        or exists (select 1 from public.user_roles
                   where user_id = _user_id and role in ('sdr','closer','full_cycle'))
      when 'qualificar'        then public.is_gestor_or_operador(_user_id)
      when 'editar_cpf'        then public.has_role(_user_id,'gestor')
      when 'sincronizar_meta'  then public.has_role(_user_id,'gestor')
      when 'ver_faturamento'   then not public.is_agencia(_user_id)
      when 'ver_comissoes'     then not public.is_agencia(_user_id)
      when 'ver_meta_ads'      then true
      else false
    end
  );
$$;

-- Aplica nas policies das ações críticas -------------------------------------

-- Lançar venda
drop policy if exists "clientes insert auth" on public.clientes_fechados;
create policy "clientes insert auth" on public.clientes_fechados
  for insert to authenticated
  with check (public.tem_permissao(auth.uid(),'lancar_venda'));

-- Qualificar / protocolar / resultado (edição técnica)
drop policy if exists "clientes update qual" on public.clientes_fechados;
create policy "clientes update qual" on public.clientes_fechados
  for update to authenticated
  using (public.tem_permissao(auth.uid(),'qualificar'))
  with check (public.tem_permissao(auth.uid(),'qualificar'));
