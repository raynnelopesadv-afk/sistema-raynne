-- Atualizador automático do cache do funil (mantém a 1ª carga sempre rápida).
-- A cada 25 min chama a edge function com force=true para renovar o cache
-- (que dura 30 min), então o funil abre instantâneo para quem acessa.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  -- >>> TROQUE pela sua anon public key (Supabase → Project Settings → API → "anon public")
  _key text := 'SUA_ANON_KEY_AQUI';
  _url text := 'https://SEU_PROJECT_REF.supabase.co/functions/v1/funcao-datacrazy-funil-ts';
begin
  -- remove um job anterior com o mesmo nome (permite rodar de novo sem erro)
  if exists (select 1 from cron.job where jobname = 'warm-funil-cache') then
    perform cron.unschedule('warm-funil-cache');
  end if;

  if _key = 'SUA_ANON_KEY_AQUI' then
    raise notice 'Cole sua anon public key na variavel _key antes de rodar. Nada foi agendado.';
    return;
  end if;

  perform cron.schedule(
    'warm-funil-cache',
    '*/25 * * * *',
    format(
      'select net.http_post(url := %L, body := jsonb_build_object(''force'', true), headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer %s''));',
      _url, _key
    )
  );
  raise notice 'Job warm-funil-cache agendado (a cada 25 min).';
end $$;
