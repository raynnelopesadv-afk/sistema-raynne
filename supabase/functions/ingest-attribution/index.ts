// Webhook de atribuição de leads de formulário.
// A automação da agência (que já alimenta a planilha) envia, para cada lead,
// o telefone + o anúncio/campanha. Aqui gravamos na central por telefone,
// que carimba os contratos automaticamente (triggers no banco).
//
// Segurança: header x-webhook-secret == env ATTRIBUTION_WEBHOOK_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Normaliza telefone BR: DDD + 8 dígitos (sem 55, sem o 9 do celular). Espelha public.norm_phone.
function normPhone(p: string): string | null {
  let d = (p ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  d = d.slice(-10);
  return d.length ? d : null;
}

// Aceita várias grafias de campo (os tools de automação nomeiam diferente).
function pick(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'use POST' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const secret = Deno.env.get('ATTRIBUTION_WEBHOOK_SECRET') ?? '';
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'json inválido' }, 400); }

  // Aceita um objeto único ou uma lista de leads.
  const items: Record<string, unknown>[] = Array.isArray(body) ? body as Record<string, unknown>[] : [body as Record<string, unknown>];

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const rows: Record<string, unknown>[] = [];
  const skipped: string[] = [];
  for (const it of items) {
    const phone = normPhone(pick(it, ['phone', 'telefone', 'phone_number', 'contactNumber', 'contact_number', 'whatsapp']) ?? '');
    if (!phone) { skipped.push('sem telefone'); continue; }
    // IDs da Meta são numéricos; alguns tools prefixam (ex.: "ag:120..."). Extrai só os dígitos.
    const rawAdId = pick(it, ['ad_id', 'adId', 'meta_ad_id', 'ad.id']);
    const digitsAdId = rawAdId ? rawAdId.replace(/\D/g, '') : '';
    const meta_ad_id = digitsAdId.length >= 6 ? digitsAdId : null;
    const ad_name = pick(it, ['ad_name', 'adName', 'ad', 'anuncio', 'creative']);
    const adset_name = pick(it, ['adset_name', 'adsetName', 'adset', 'conjunto']);
    const campaign_name = pick(it, ['campaign_name', 'campaignName', 'campaign', 'campanha']);
    const meta_adset_id = pick(it, ['adset_id', 'adsetId', 'meta_adset_id']);
    const meta_campaign_id = pick(it, ['campaign_id', 'campaignId', 'meta_campaign_id']);
    if (!meta_ad_id && !ad_name && !campaign_name) { skipped.push(`${phone}: sem anúncio`); continue; }

    // Sem ad_id mas com nome: tenta resolver o ad_id pelo nome do anúncio.
    let resolvedAdId = meta_ad_id;
    if (!resolvedAdId && ad_name) {
      const { data } = await admin.from('meta_ads').select('id').ilike('name', ad_name).limit(1);
      if (data && data[0]) resolvedAdId = String(data[0].id);
    }

    // Manda os nomes recebidos; se o ad_id resolver, o trigger sobrescreve com
    // os nomes canônicos do meta_ads. Se não resolver, ficam os nomes recebidos.
    rows.push({
      phone,
      meta_ad_id: resolvedAdId,
      meta_adset_id,
      meta_campaign_id,
      ad_name,
      adset_name,
      campaign_name,
      source: 'form',
      raw: it,
    });
  }

  if (!rows.length) return json({ ok: true, upserted: 0, skipped }, 200);

  const { error } = await admin.from('lead_attribution').upsert(rows, { onConflict: 'phone' });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, upserted: rows.length, skipped }, 200);

  function json(o: unknown, status: number) {
    return new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
