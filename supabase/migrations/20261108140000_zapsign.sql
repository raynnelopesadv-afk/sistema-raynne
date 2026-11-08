-- =====================================================================
-- ZAPSIGN — contratos assinados e assinaturas pendentes
-- Preenchido pelo GitHub Actions (scripts/zapsign.mjs) com a API do ZapSign.
-- =====================================================================
create table if not exists public.zapsign_documentos (
  token text primary key,                 -- token do documento no ZapSign
  nome_documento text,
  status text,                            -- pending | signed | refused
  criado_em timestamptz,
  atualizado_zapsign_em timestamptz,
  assinado_em timestamptz,                -- quando o cliente assinou
  cliente_nome text,
  cliente_telefone text,
  cliente_email text,
  cliente_status text,                    -- new | signed | refused (do signatário cliente)
  cliente_visualizacoes int,
  cliente_ultima_visualizacao timestamptz,
  link_assinatura text,
  link_documento text,
  signatarios jsonb,
  cobrado_em timestamptz,                 -- quando a equipe marcou que cobrou
  observacao text,
  sincronizado_em timestamptz not null default now()
);
create index if not exists ix_zap_status on public.zapsign_documentos (status, criado_em desc);
create index if not exists ix_zap_assinado on public.zapsign_documentos (assinado_em desc);

alter table public.zapsign_documentos enable row level security;
drop policy if exists "zapsign leitura" on public.zapsign_documentos;
create policy "zapsign leitura" on public.zapsign_documentos for select to authenticated using (public.acesso_juridico(auth.uid()));
drop policy if exists "zapsign edicao" on public.zapsign_documentos;
create policy "zapsign edicao" on public.zapsign_documentos for update to authenticated
  using (public.acesso_juridico(auth.uid())) with check (public.acesso_juridico(auth.uid()));
