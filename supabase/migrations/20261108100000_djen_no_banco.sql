-- =====================================================================
-- DJEN AUTOMÁTICO DE DENTRO DO BANCO (São Paulo)
-- O CNJ recusa consultas vindas de fora do Brasil (ex.: GitHub Actions).
-- Aqui o próprio banco, hospedado em São Paulo, consulta o DJEN pela OAB,
-- guarda as respostas e as transforma em publicações. Roda sozinho via pg_cron.
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- OABs monitoradas (dá para incluir colaboradores depois)
create table if not exists public.djen_oabs (
  oab text not null,
  uf text not null,
  ativo boolean not null default true,
  primary key (oab, uf)
);
insert into public.djen_oabs (oab, uf) values ('160914', 'MG') on conflict do nothing;
alter table public.djen_oabs enable row level security;
drop policy if exists "djen_oabs leitura" on public.djen_oabs;
create policy "djen_oabs leitura" on public.djen_oabs for select to authenticated using (public.acesso_juridico(auth.uid()));
drop policy if exists "djen_oabs gestor" on public.djen_oabs;
create policy "djen_oabs gestor" on public.djen_oabs for all to authenticated
  using (public.has_role(auth.uid(),'gestor')) with check (public.has_role(auth.uid(),'gestor'));

-- Pedidos feitos ao DJEN aguardando resposta
create table if not exists public.djen_pedidos (
  request_id bigint primary key,
  oab text not null,
  uf text not null,
  pagina int not null,
  criado_em timestamptz not null default now(),
  processado boolean not null default false
);
alter table public.djen_pedidos enable row level security;

-- UF pelo número CNJ (justiça estadual: J=8, TR = código do TJ)
create or replace function public.uf_do_cnj(_numero text)
returns text language sql immutable as $$
  select case when length(d) = 20 and substr(d, 14, 1) = '8' then
    (array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
           'PE','PI','RJ','RN','RS','RO','RR','SC','SE','SP','TO'])[nullif(substr(d, 15, 2), '')::int]
  end
  from (select regexp_replace(coalesce(_numero, ''), '\D', '', 'g') as d) x;
$$;

create or replace function public.mascara_cnj(_numero text)
returns text language sql immutable as $$
  select case when length(d) = 20 then
    substr(d,1,7)||'-'||substr(d,8,2)||'.'||substr(d,10,4)||'.'||substr(d,14,1)||'.'||substr(d,15,2)||'.'||substr(d,17,4)
  else nullif(_numero, '') end
  from (select regexp_replace(coalesce(_numero, ''), '\D', '', 'g') as d) x;
$$;

-- 1) Pede ao DJEN as publicações dos últimos _dias (várias páginas de 100)
create or replace function public.djen_solicitar(_dias int default 3, _paginas int default 6)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  o record;
  p int;
  rid bigint;
  n int := 0;
  ate date := (now() at time zone 'America/Sao_Paulo')::date;
  de date := ate - _dias;
begin
  for o in select oab, uf from public.djen_oabs where ativo loop
    for p in 1.._paginas loop
      select net.http_get(
        url := format('https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=%s&ufOab=%s&dataDisponibilizacaoInicio=%s&dataDisponibilizacaoFim=%s&pagina=%s&itensPorPagina=100',
                      o.oab, o.uf, de, ate, p),
        headers := '{"Accept":"application/json","User-Agent":"Mozilla/5.0 (sistema RL Advocacia)"}'::jsonb,
        timeout_milliseconds := 30000
      ) into rid;
      insert into public.djen_pedidos (request_id, oab, uf, pagina) values (rid, o.oab, o.uf, p)
      on conflict do nothing;
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

-- 2) Lê as respostas que já chegaram e grava as publicações
create or replace function public.djen_processar()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  ped record;
  resp record;
  it jsonb;
  num text;
  paginas int := 0;
  ins_pub int := 0;
  upd_pub int := 0;
  eh_novo boolean;
  erros text := null;
begin
  for ped in select * from public.djen_pedidos where not processado order by criado_em, pagina loop
    select status_code, content, error_msg into resp from net._http_response where id = ped.request_id;
    if not found then
      -- ainda sem resposta; desiste depois de 30 min
      if ped.criado_em < now() - interval '30 minutes' then
        update public.djen_pedidos set processado = true where request_id = ped.request_id;
        erros := coalesce(erros || '; ', '') || format('pág %s sem resposta', ped.pagina);
      end if;
      continue;
    end if;

    if resp.status_code = 200 and resp.content is not null and left(ltrim(resp.content), 1) = '{' then
      for it in select * from jsonb_array_elements(coalesce(resp.content::jsonb -> 'items', '[]'::jsonb)) loop
        num := public.mascara_cnj(coalesce(it->>'numeroprocessocommascara', it->>'numero_processo'));
        insert into public.publicacoes as p (
          fonte, id_externo, data_disponibilizacao, tribunal, uf, orgao, numero_processo,
          tipo_comunicacao, tipo_documento, classe, texto, link, status
        ) values (
          'djen', it->>'id', nullif(coalesce(it->>'data_disponibilizacao', it->>'datadisponibilizacao'), '')::date,
          it->>'siglaTribunal',
          coalesce(public.uf_do_cnj(num), substring(it->>'siglaTribunal' from '^TJ([A-Z]{2})$')),
          it->>'nomeOrgao', num, it->>'tipoComunicacao', it->>'tipoDocumento', it->>'nomeClasse',
          nullif(btrim(regexp_replace(regexp_replace(coalesce(it->>'texto',''), '<br\s*/?>', E'\n', 'gi'), '<[^>]+>', ' ', 'g')), ''),
          it->>'link', 'nao_lida'
        )
        on conflict (fonte, id_externo) do update set
          data_disponibilizacao = excluded.data_disponibilizacao,
          tribunal = excluded.tribunal, uf = excluded.uf, orgao = excluded.orgao,
          numero_processo = excluded.numero_processo, tipo_comunicacao = excluded.tipo_comunicacao,
          tipo_documento = excluded.tipo_documento, classe = excluded.classe,
          texto = excluded.texto, link = excluded.link
        returning (xmax = 0) into eh_novo;
        if eh_novo then ins_pub := ins_pub + 1; else upd_pub := upd_pub + 1; end if;
      end loop;
    else
      erros := coalesce(erros || '; ', '') || format('pág %s: HTTP %s %s', ped.pagina, resp.status_code, coalesce(resp.error_msg, ''));
    end if;

    update public.djen_pedidos set processado = true where request_id = ped.request_id;
    paginas := paginas + 1;
  end loop;

  if paginas > 0 or erros is not null then
    insert into public.sync_juridico (fonte, inseridos, atualizados, erro)
    values ('djen 160914/MG', ins_pub, upd_pub, erros);
  end if;

  delete from public.djen_pedidos where processado and criado_em < now() - interval '7 days';
  return ins_pub;
end;
$$;

revoke execute on function public.djen_solicitar(int, int) from public, anon, authenticated;
revoke execute on function public.djen_processar() from public, anon, authenticated;

-- 3) Agenda: busca às 07:00, 12:00 e 18:00 (Brasília), todos os dias; processa a cada 5 min
do $$
begin
  if exists (select 1 from cron.job where jobname = 'djen-solicitar') then perform cron.unschedule('djen-solicitar'); end if;
  if exists (select 1 from cron.job where jobname = 'djen-processar') then perform cron.unschedule('djen-processar'); end if;
  perform cron.schedule('djen-solicitar', '0 10,15,21 * * *', 'select public.djen_solicitar(3, 6)');
  perform cron.schedule('djen-processar', '*/5 * * * *', 'select public.djen_processar()');
end $$;
