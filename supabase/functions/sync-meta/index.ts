// Sincroniza campanhas, conjuntos, anúncios, criativos e métricas
// diárias da Meta Marketing API para o banco do BI.
// Secrets: META_ACCESS_TOKEN (token de Usuário do Sistema, ads_read)
//          META_AD_ACCOUNT_ID (formato act_XXXXXXXX)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GRAPH = 'https://graph.facebook.com/v23.0';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// GET paginado da Graph API (segue paging.next)
async function graphGetAll(url: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let next: string | null = url;
  let guard = 0;
  while (next && guard < 50) {
    const res = await fetch(next);
    const body = await res.json();
    if (!res.ok || body.error) {
      throw new Error(`Meta API: ${body?.error?.message ?? res.status}`);
    }
    out.push(...(body.data ?? []));
    next = body?.paging?.next ?? null;
    guard += 1;
    if (next) await sleep(250);
  }
  return out;
}

function actionCount(actions: unknown, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  return actions
    .filter((a: Record<string, unknown>) => types.includes(String(a.action_type)))
    .reduce((s: number, a: Record<string, unknown>) => s + (Number(a.value) || 0), 0);
}

// Extrai a mensagem pré-preenchida (click-to-WhatsApp) do criativo, tentando
// os vários lugares onde a Meta guarda esse texto. Usada para casar com a
// primeira mensagem do lead no Liderhub → atribuição automática por anúncio.
function extractPrefilled(creative: Record<string, unknown>): string | null {
  const tryText = (link: unknown): string | null => {
    if (typeof link !== 'string') return null;
    const m = link.match(/[?&]text=([^&]+)/i);
    if (m) { try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch { return m[1]; } }
    return null;
  };
  const oss = (creative.object_story_spec ?? {}) as Record<string, any>;
  // 1) deep link wa.me / api.whatsapp.com com ?text=
  const linkCandidates = [
    oss?.link_data?.link,
    oss?.video_data?.call_to_action?.value?.link,
    oss?.link_data?.call_to_action?.value?.link,
  ];
  for (const c of linkCandidates) { const t = tryText(c); if (t) return t.trim(); }
  // 2) campos diretos de mensagem/saudação
  const direct = [
    oss?.link_data?.message,
    oss?.link_data?.call_to_action?.value?.whatsapp_number ? oss?.link_data?.call_to_action?.value?.text : null,
    (creative as any)?.page_welcome_message,
    (creative as any)?.messenger_welcome_message,
  ];
  for (const d of direct) { if (typeof d === 'string' && d.trim()) return d.trim(); }
  // 3) asset_feed_spec (anúncios dinâmicos) — pega o 1º link com text=
  const afs = (creative.asset_feed_spec ?? {}) as Record<string, any>;
  for (const lu of (afs?.link_urls ?? [])) { const t = tryText(lu?.website_url) ?? (typeof lu?.message === 'string' ? lu.message : null); if (t) return t.trim(); }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
  const TOKEN = Deno.env.get('META_ACCESS_TOKEN');
  const ACCOUNT = Deno.env.get('META_AD_ACCOUNT_ID');

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const { data: logRow } = await admin
    .from('integration_sync_logs')
    .insert({ integration: 'meta' })
    .select('id')
    .single();
  const logId = logRow?.id;
  const finishLog = async (ok: boolean, items: number, error?: string) => {
    if (logId) await admin.from('integration_sync_logs')
      .update({ finished_at: new Date().toISOString(), ok, items, error: error ?? null })
      .eq('id', logId);
  };

  try {
    if (!TOKEN || !ACCOUNT) throw new Error('Secrets META_ACCESS_TOKEN / META_AD_ACCOUNT_ID não configurados');
    const act = ACCOUNT.startsWith('act_') ? ACCOUNT : `act_${ACCOUNT}`;

    // Autenticação do chamador (ou chamada interna do cron com service role)
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
    // Padrão 4 dias: o cron diário mantém o spend recente fresco de forma
    // síncrona (leve). O histórico longo é feito por backfill via API assíncrona.
    const days: number = Math.min(90, Math.max(1, Number(body?.days) || 4));

    let items = 0;
    const now = new Date().toISOString();

    // 1. Campanhas -------------------------------------------------
    const campaigns = await graphGetAll(
      `${GRAPH}/${act}/campaigns?fields=id,name,status,objective,daily_budget&limit=200&access_token=${TOKEN}`,
    );
    if (campaigns.length) {
      const payload = campaigns.map(c => ({
        id: c.id, name: c.name, status: c.status, objective: c.objective ?? null,
        daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null, raw: c, synced_at: now,
      }));
      const { error } = await admin.from('meta_campaigns').upsert(payload, { onConflict: 'id' });
      if (error) throw new Error(`upsert meta_campaigns: ${error.message}`);
      items += payload.length;
    }

    // 2. Conjuntos ---------------------------------------------------
    const adsets = await graphGetAll(
      `${GRAPH}/${act}/adsets?fields=id,name,status,campaign_id&limit=200&access_token=${TOKEN}`,
    );
    if (adsets.length) {
      const payload = adsets.map(a => ({
        id: a.id, campaign_id: a.campaign_id ?? null, name: a.name, status: a.status, raw: a, synced_at: now,
      }));
      const { error } = await admin.from('meta_adsets').upsert(payload, { onConflict: 'id' });
      if (error) throw new Error(`upsert meta_adsets: ${error.message}`);
      items += payload.length;
    }

    // 3. Anúncios + criativos ---------------------------------------
    // Criativo enxuto: só link_data (onde mora o link wa.me com ?text=) — pedir
    // object_story_spec/asset_feed_spec inteiros faz a Meta recusar por volume.
    const ads = await graphGetAll(
      `${GRAPH}/${act}/ads?fields=id,name,status,adset_id,campaign_id,creative{id,thumbnail_url,title,body,object_story_spec{link_data{link,message,call_to_action}}}&limit=40&access_token=${TOKEN}`,
    );
    if (ads.length) {
      const payload = ads.map(a => {
        const cr = (a.creative ?? {}) as Record<string, unknown>;
        return {
          id: a.id, adset_id: a.adset_id ?? null, campaign_id: a.campaign_id ?? null,
          name: a.name, status: a.status,
          creative_id: cr.id ?? null,
          creative_thumbnail_url: cr.thumbnail_url ?? null,
          creative_title: cr.title ?? null,
          creative_body: cr.body ?? null,
          prefilled_message: extractPrefilled(cr),
          raw: a, synced_at: now,
        };
      });
      const { error } = await admin.from('meta_ads').upsert(payload, { onConflict: 'id' });
      if (error) throw new Error(`upsert meta_ads: ${error.message}`);
      items += payload.length;
    }

    // 4. Insights diários por anúncio --------------------------------
    // Insights buscados em janelas de 30 dias — a Meta recusa (code 2)
    // pedidos diários muito longos numa tacada só.
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const nowMs = Date.now();
    const knownAds = new Set(ads.map(a => String(a.id)));
    const CHUNK = 30;
    let insightRows = 0;
    for (let off = 0; off < days; off += CHUNK) {
      const until = new Date(nowMs - off * 86400_000);
      const since = new Date(nowMs - Math.min(days, off + CHUNK) * 86400_000);
      const timeRange = encodeURIComponent(JSON.stringify({ since: fmt(since), until: fmt(until) }));
      const chunk = await graphGetAll(
        `${GRAPH}/${act}/insights?level=ad&time_increment=1&fields=ad_id,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions&time_range=${timeRange}&limit=500&access_token=${TOKEN}`,
      );
      const payload = chunk
        .filter(i => knownAds.has(String(i.ad_id)))
        .map(i => ({
          ad_id: i.ad_id,
          date: i.date_start,
          spend: Number(i.spend) || 0,
          impressions: Number(i.impressions) || 0,
          reach: Number(i.reach) || 0,
          clicks: Number(i.clicks) || 0,
          ctr: i.ctr != null ? Number(i.ctr) : null,
          cpc: i.cpc != null ? Number(i.cpc) : null,
          cpm: i.cpm != null ? Number(i.cpm) : null,
          frequency: i.frequency != null ? Number(i.frequency) : null,
          leads: actionCount(i.actions, ['lead', 'leadgen_grouped', 'onsite_conversion.lead_grouped']),
          conversations: actionCount(i.actions, ['onsite_conversion.messaging_conversation_started_7d']),
          raw_actions: i.actions ?? null,
          synced_at: now,
        }));
      if (payload.length) {
        const { error } = await admin.from('meta_insights_daily').upsert(payload, { onConflict: 'ad_id,date' });
        if (error) throw new Error(`upsert meta_insights_daily: ${error.message}`);
        insightRows += payload.length;
        items += payload.length;
      }
    }

    await finishLog(true, items);
    return json({ ok: true, items, campaigns: campaigns.length, adsets: adsets.length, ads: ads.length, insight_rows: insightRows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('sync-meta erro:', msg);
    await finishLog(false, 0, msg);
    return json({ ok: false, error: msg }, 500);
  }
});
