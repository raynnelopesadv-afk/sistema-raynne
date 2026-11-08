// Webhook do Data Crazy — recebe "negócio ganho" e espelha o fechamento aqui.
//   - Segurança: exige ?token=<DATACRAZY_WEBHOOK_SECRET> (ou header x-webhook-secret).
//   - Idempotente: não duplica (índice único em clientes_fechados.dc_business_id).
//   - Busca o negócio/lead/atendente no DC (autoritativo) usando DATACRAZY_TOKEN.
//   - GANHO é definido pela ETAPA: só espelha se a etapa atual do negócio estiver
//     marcada como 'ganho' na aba Funis (tabela funil_classificacao) — assim cada
//     pipe tem seu próprio critério (AMEA: 'Ganho'; UBER/APP: 'Assinado').
//   - Casa PRODUTO por SKU e CLOSER por e-mail. Falta de dado => incompleto (vermelho).
// Sem dependências externas (só fetch), para não falhar na inicialização.
//
// Configurar no Supabase: Verify JWT = OFF; secrets DATACRAZY_TOKEN e
// DATACRAZY_WEBHOOK_SECRET. No Data Crazy, apontar o webhook de "ganho" para:
//   https://<projeto>.supabase.co/functions/v1/datacrazy-webhook?token=<secret>

const DC_BASE = 'https://api.g1.datacrazy.io/api/v1';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DC_TOKEN = Deno.env.get('DATACRAZY_TOKEN') ?? '';
const SECRET = Deno.env.get('DATACRAZY_WEBHOOK_SECRET') ?? '';
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function dcGet(path: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${DC_BASE}${path}`, { headers: { Authorization: `Bearer ${DC_TOKEN}` } });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch { return null; }
}
async function sbGet(path: string): Promise<unknown[] | null> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch { return null; }
}

const OFFSET = 3 * 3600 * 1000; // Brasília UTC-3
const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
function diaBR(iso: unknown): string | null {
  const t = iso ? new Date(String(iso)).getTime() : NaN;
  if (isNaN(t)) return null;
  return new Date(t - OFFSET).toISOString().slice(0, 10);
}
function pick(obj: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k];
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    // 1) Segurança
    const url = new URL(req.url);
    if (SECRET) {
      const tok = url.searchParams.get('token') || req.headers.get('x-webhook-secret') || '';
      if (tok !== SECRET) return json({ error: 'unauthorized' }, 401);
    }

    const raw = await req.text().catch(() => '');
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }

    // 2) ID do negócio — aceita JSON ({businessId}/{id}/aninhado) OU o id puro
    //    (corpo enviado como texto simples, ex.: a variável "ID do negócio" sozinha).
    const nested = (body.business ?? body.data ?? body.deal ?? body.negocio) as Record<string, unknown> | undefined;
    let bid = pick(body, 'businessId', 'business_id', 'id', 'dealId') ?? pick(nested, 'id');
    if (!bid && raw) {
      const t = raw.trim().replace(/^["']|["']$/g, '');
      if (t && !t.startsWith('{') && !t.startsWith('[')) bid = t;
    }
    if (!bid) return json({ error: 'id do negócio não encontrado no corpo', recebido: raw.slice(0, 200) });

    // 3) Idempotência — só cria UMA vez por negócio. Se o UBER/APP tem 3 etapas
    //    de ganho, a 1ª que o negócio tocar cria o fechamento; as demais caem aqui.
    const existe = await sbGet(`clientes_fechados?select=id&dc_business_id=eq.${encodeURIComponent(String(bid))}&limit=1`);
    if (Array.isArray(existe) && existe.length) return json({ ok: true, jaExiste: true, id: (existe[0] as { id: string }).id });

    // 4) Negócio (autoritativo pela API; cai no payload se a API falhar)
    const biz = (await dcGet(`/businesses/${bid}`)) ?? nested ?? body;

    // 4.1) GANHO pela ETAPA: a etapa atual precisa estar marcada como 'ganho'
    //      na aba Funis (funil_classificacao). Cada pipe tem seu próprio critério.
    const stageId = String(pick(biz, 'stageId', 'stage_id') ?? '');
    const cls = stageId
      ? await sbGet(`funil_classificacao?select=tipo&stage_id=eq.${encodeURIComponent(stageId)}&tipo=eq.ganho&limit=1`)
      : null;
    if (!Array.isArray(cls) || cls.length === 0) {
      return json({ ok: true, ignorado: 'etapa atual não é de ganho', stageId });
    }

    const total = Number(pick(biz, 'total', 'value')) || 0;
    const leadId = pick(biz, 'leadId') ?? pick((biz.lead as Record<string, unknown>), 'id');
    const attendantId = pick(biz, 'attendantId') ?? pick((biz.attendant as Record<string, unknown>), 'id');
    const dataMov = pick(biz, 'lastMovedAt', 'statusChangedAt', 'createdAt');

    // SKU do produto do negócio
    const prod0 = (Array.isArray(biz.products) ? biz.products[0] : undefined) as Record<string, unknown> | undefined;
    const sku = String(pick(prod0?.product as Record<string, unknown>, 'id_sku', 'sku') ?? pick(prod0, 'id_sku', 'sku') ?? '') || null;

    // 5) Lead (CPF / nome / telefone)
    const lead = leadId ? await dcGet(`/leads/${leadId}`) : null;
    const nome = String(pick(lead, 'name', 'nome') ?? pick(biz.lead as Record<string, unknown>, 'name', 'nome') ?? 'Sem nome (Data Crazy)');
    const cpf = soDigitos(pick(lead, 'taxId', 'cpf', 'document', 'cpfCnpj')) || null;
    // entrada do lead (início do ciclo de venda)
    const criacaoLeadRaw = pick(lead, 'createdAt') ?? pick(biz, 'createdAt');
    const dataCriacaoLead = diaBR(criacaoLeadRaw);
    const criacaoLeadEm = criacaoLeadRaw ? new Date(String(criacaoLeadRaw)).toISOString() : null;
    const telefone = String(pick(lead, 'phone', 'telefone', 'whatsapp', 'cellphone', 'mobilePhone') ?? '') || null;

    // 6) Atendente -> e-mail -> closer (caminho correto: /attendants/crm/{id};
    //    casamento por e-mail SEM diferenciar maiúsc./minúsc.)
    let closer: { id: string; divisao: string } | null = null;
    let emailAtendente = '';
    if (attendantId) {
      const at = await dcGet(`/attendants/crm/${attendantId}`);
      emailAtendente = String(pick(at, 'email') ?? '').toLowerCase().trim();
      if (emailAtendente) {
        // 1) casa pelo e-mail do USUÁRIO (profiles). O closer tem o MESMO id do usuário.
        const profs = (await sbGet(`profiles?select=user_id,email&email=not.is.null`)) ?? [];
        const prof = (profs as Array<{ user_id: string; email: string | null }>)
          .find(pf => (pf.email ?? '').toLowerCase().trim() === emailAtendente);
        if (prof) {
          const cs = (await sbGet(`closers?select=id,divisao&id=eq.${prof.user_id}&limit=1`)) ?? [];
          if (Array.isArray(cs) && cs.length) closer = cs[0] as { id: string; divisao: string };
        }
        // 2) fallback: e-mail cadastrado direto no closer (Colaboradores), se houver.
        if (!closer) {
          const cs = (await sbGet(`closers?select=id,divisao,email&email=not.is.null`)) ?? [];
          const found = (cs as Array<{ id: string; divisao: string; email: string | null }>)
            .find(c => (c.email ?? '').toLowerCase().trim() === emailAtendente);
          if (found) closer = { id: found.id, divisao: found.divisao };
        }
      }
    }
    console.log(`[webhook] biz=${bid} attendantId=${attendantId ?? '-'} email=${emailAtendente || '-'} closer=${closer ? closer.id : 'NAO ENCONTRADO'}`);

    // 7) Produto por SKU (produto sem variante OU variante)
    let product_id: string | null = null, variante: string | null = null, divisao: string | null = null;
    if (sku) {
      const prods = (await sbGet(`products?select=id,divisao,sku,variantes_config,nome`)) ?? [];
      for (const p of prods as Array<{ id: string; divisao: string; sku: string | null; variantes_config: Array<{ nome: string; sku: string }> | null }>) {
        if ((p.sku || '') === sku) { product_id = p.id; divisao = p.divisao; break; }
        const v = (Array.isArray(p.variantes_config) ? p.variantes_config : []).find(x => (x.sku || '') === sku);
        if (v) { product_id = p.id; variante = v.nome; divisao = p.divisao; break; }
      }
    }
    if (!divisao) divisao = closer?.divisao ?? 'advogados';

    // 8) Completo?
    const faltando: string[] = [];
    if (!cpf) faltando.push('CPF');
    if (!telefone) faltando.push('Telefone');
    if (!closer) faltando.push('Closer');
    if (!product_id) faltando.push('Produto');
    if (!(total > 0)) faltando.push('Valor');

    const row = {
      dc_business_id: String(bid),
      dc_lead_id: leadId ? String(leadId) : null,
      origem: 'datacrazy',
      nome_cliente: nome,
      cpf, telefone,
      valor: total,
      closer_id: closer?.id ?? null,
      product_id, variante,
      divisao,
      data_fechamento: diaBR(dataMov) ?? new Date(Date.now() - OFFSET).toISOString().slice(0, 10),
      fechado_em: dataMov ? new Date(String(dataMov)).toISOString() : new Date().toISOString(),
      status_qualificacao: 'pendente',
      data_criacao_lead: dataCriacaoLead,
      criacao_lead_em: criacaoLeadEm,
      incompleto: faltando.length > 0,
    };

    const ins = await fetch(`${SB_URL}/rest/v1/clientes_fechados`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(row),
    });
    if (!ins.ok) {
      const txt = await ins.text().catch(() => '');
      // 23505 = violação do único (corrida): já existe, tudo bem
      if (ins.status === 409 || txt.includes('23505')) return json({ ok: true, jaExiste: true });
      return json({ error: 'falha ao inserir', status: ins.status, detalhe: txt.slice(0, 300) });
    }
    return json({ ok: true, incompleto: row.incompleto, faltando, closer: !!closer, product_id: !!product_id, emailAtendente: emailAtendente || null });
  } catch (e) {
    return json({ error: (e as Error).message });
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
