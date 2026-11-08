// Sincroniza rótulos e leads do Liderhub para o banco do BI.
// Autenticação: usuário logado (qualquer papel pode disparar; escrita é via service role).
// Rate limit do Liderhub: 3 req/s → intervalo de 400ms + retry com backoff no 429.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LH_BASE = 'https://api.liderhub.com.br/v1';
const PAGE_LIMIT = 100;
const THROTTLE_MS = 450;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function lhGet(path: string, key: string, attempt = 0): Promise<unknown> {
  const res = await fetch(`${LH_BASE}${path}`, { headers: { 'x-company-key': key } });
  if (res.status === 429) {
    if (attempt >= 5) throw new Error(`Liderhub 429 persistente em ${path}`);
    await sleep(1000 * Math.pow(2, attempt)); // backoff exponencial
    return lhGet(path, key, attempt + 1);
  }
  if (!res.ok) throw new Error(`Liderhub ${res.status} em ${path}: ${await res.text()}`);
  return res.json();
}

// Mapeamento inicial do funil por NOME do rótulo (aplicado só se o
// rótulo ainda não estiver classificado — depois é editável no BI).
const DEFAULT_CLASS: Record<string, string> = {
  'qualificado': 'qualificado',
  'desqualificado': 'desqualificado',
  'reunião': 'mql',
  'proposta aceita': 'mql',
  'assinatura pendente': 'mql',
  'aguardando docs': 'mql',
  'contrato assinado': 'fechamento',
  'contrato qualificado': 'fechamento',
  'sucesso do cliente': 'fechamento',
  'desistência': 'perdido',
  'proposta recusada': 'perdido',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
  const LH_KEY = Deno.env.get('LIDERHUB_COMPANY_KEY');

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // Log de sincronização (criado já no início; finalizado no fim)
  const { data: logRow } = await admin
    .from('integration_sync_logs')
    .insert({ integration: 'liderhub' })
    .select('id')
    .single();
  const logId = logRow?.id;
  const finishLog = async (ok: boolean, items: number, error?: string) => {
    if (logId) await admin.from('integration_sync_logs')
      .update({ finished_at: new Date().toISOString(), ok, items, error: error ?? null })
      .eq('id', logId);
  };

  try {
    if (!LH_KEY) throw new Error('Secret LIDERHUB_COMPANY_KEY não configurado');

    // 1. Autenticação do chamador (aceita também chamadas internas com service role ou cron secret)
    const authHeader = req.headers.get('Authorization') ?? '';
    const cronSecretHeader = req.headers.get('x-cron-secret') ?? '';
    const CRON_SECRET = Deno.env.get('CRON_TOKEN') ?? Deno.env.get('CRON_SECRET') ?? '';
    const isServiceCall = authHeader.includes(SERVICE_ROLE);
    const isCronCall = !!CRON_SECRET && cronSecretHeader === CRON_SECRET;
    if (!isServiceCall && !isCronCall) {
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData.user) {
        await finishLog(false, 0, 'Não autenticado');
        return json({ error: 'Não autenticado' }, 401);
      }
    }

    const body = await req.json().catch(() => ({}));
    const fullSync: boolean = body?.full === true;

    let items = 0;

    // 2. Dicionário de rótulos --------------------------------------
    const labelKinds: [string, string][] = [
      ['status', '/settings/status'],
      ['source', '/settings/source'],
      ['tag', '/settings/tags'],
      ['department', '/settings/departamentos'],
    ];
    for (const [kind, path] of labelKinds) {
      const rows = (await lhGet(path, LH_KEY)) as { id: string; name: string }[];
      await sleep(THROTTLE_MS);
      if (Array.isArray(rows) && rows.length) {
        const payload = rows.map(r => ({ id: r.id, kind, name: (r.name ?? '').trim(), synced_at: new Date().toISOString() }));
        const { error } = await admin.from('lh_labels').upsert(payload, { onConflict: 'id' });
        if (error) throw new Error(`upsert lh_labels(${kind}): ${error.message}`);
        items += payload.length;
      }
    }
    // Atendentes (users)
    try {
      const users = (await lhGet('/users', LH_KEY)) as { id: string; name?: string; email?: string }[];
      await sleep(THROTTLE_MS);
      if (Array.isArray(users) && users.length) {
        const payload = users.map(u => ({ id: u.id, kind: 'user', name: (u.name ?? u.email ?? 'Sem nome').trim(), synced_at: new Date().toISOString() }));
        const { error } = await admin.from('lh_labels').upsert(payload, { onConflict: 'id' });
        if (error) throw new Error(`upsert lh_labels(user): ${error.message}`);
        items += payload.length;
      }
    } catch (e) {
      console.warn('users endpoint falhou (segue sem atendentes):', e);
    }

    // 3. Seed do mapeamento de funil (só para rótulos ainda não mapeados)
    const { data: statusLabels } = await admin.from('lh_labels').select('id, name').eq('kind', 'status');
    const { data: mapped } = await admin.from('lead_class_map').select('label_id');
    const mappedSet = new Set((mapped ?? []).map(m => m.label_id));
    const seeds = (statusLabels ?? [])
      .filter(l => !mappedSet.has(l.id))
      .map(l => ({ label_id: l.id, classification: DEFAULT_CLASS[l.name.trim().toLowerCase()] }))
      .filter(s => !!s.classification);
    if (seeds.length) {
      const { error } = await admin.from('lead_class_map').upsert(seeds, { onConflict: 'label_id' });
      if (error) throw new Error(`seed lead_class_map: ${error.message}`);
    }

    // 4. Leads (contatos) — incremental por modifiedAfter ------------
    let modifiedAfter: string | null = null;
    if (!fullSync) {
      const { data: lastOk } = await admin
        .from('integration_sync_logs')
        .select('started_at')
        .eq('integration', 'liderhub')
        .eq('ok', true)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastOk?.started_at) {
        // margem de 2h para não perder atualizações na borda
        modifiedAfter = new Date(new Date(lastOk.started_at).getTime() - 2 * 3600_000).toISOString();
      }
    }

    let page = 1;
    let hasNext = true;
    while (hasNext) {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
      if (modifiedAfter) qs.set('modifiedAfter', modifiedAfter);
      const res = (await lhGet(`/contacts?${qs.toString()}`, LH_KEY)) as {
        contacts: Record<string, unknown>[];
        pagination: { hasNextPage: boolean; totalPages: number };
      };
      await sleep(THROTTLE_MS);

      const contacts = res?.contacts ?? [];
      if (contacts.length) {
        const payload = contacts.map((c) => ({
          id: c.id,
          contact_number: c.contactNumber ?? null,
          contact_name: c.contactName ?? null,
          department_id: c.department ?? null,
          status_id: c.status ?? null,
          source_id: c.source ?? null,
          connection_id: c.connection ?? null,
          agent_id: c.agent ?? null,
          user_id: c.user ?? null,
          ticket_status: c.ticketStatus ?? null,
          integration: c.integration ?? null,
          tags: Array.isArray(c.tags) ? c.tags : [],
          created_at: c.createdAt ?? null,
          raw: c,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await admin.from('lh_leads').upsert(payload, { onConflict: 'id' });
        if (error) throw new Error(`upsert lh_leads p.${page}: ${error.message}`);
        items += payload.length;
        // A atribuição CTWA é extraída no banco por trigger em lh_leads
        // (public.lh_lead_ctwa_attr), então o sync não precisa tratar aqui.
      }

      hasNext = res?.pagination?.hasNextPage === true && contacts.length > 0;
      page += 1;
      if (page > 500) break; // trava de segurança
    }

    // 5. Primeira mensagem de cada lead (para atribuição por anúncio) --
    // A saudação de campanhas click-to-WhatsApp costuma trazer a mensagem
    // pré-preenchida do anúncio. Capturamos apenas de leads que ainda não
    // têm first_message, com teto por execução (rate limit + timeout).
    const MAX_MSGS_PER_RUN = 25;
    const { data: pending } = await admin
      .from('lh_leads')
      .select('id')
      .is('first_message', null)
      .order('created_at', { ascending: false })
      .limit(MAX_MSGS_PER_RUN);
    for (const lead of (pending ?? [])) {
      try {
        const mres = (await lhGet(`/message?contact=${lead.id}&limit=60`, LH_KEY)) as { messages?: Record<string, unknown>[] };
        await sleep(THROTTLE_MS);
        const inbound = (mres?.messages ?? [])
          .filter(m => m.outbound === false && typeof m.content === 'string' && (m.content as string).trim())
          .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        const first = inbound[0]?.content as string | undefined;
        // string vazia marca "já processado, sem mensagem recebida" (não repuxa)
        await admin.from('lh_leads').update({ first_message: first ?? '' }).eq('id', lead.id);
        if (first) items += 1;
      } catch (e) {
        console.warn(`msg lead ${lead.id} falhou:`, e);
      }
    }

    await finishLog(true, items);
    return json({ ok: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('sync-liderhub erro:', msg);
    await finishLog(false, 0, msg);
    return json({ ok: false, error: msg }, 500);
  }
});
