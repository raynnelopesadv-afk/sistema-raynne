// Integração com o CRM Data Crazy — monta o funil (cone) a partir dos pipes.
//   - Lê o token da API em DATACRAZY_TOKEN (secret da função).
//   - Retorna pipelines + etapas da pipeline escolhida com contagem e valor.
//   - Respeita o limite de 60 req/min da API (backoff no 429), guarda o
//     resultado em cache e, se a API estiver ocupada, devolve o último cache
//     em vez de dar erro na tela.
// Sem dependências externas (usa só fetch) para não falhar na inicialização.

const BASE = 'https://api.g1.datacrazy.io/api/v1';
const TAKE = 1000; // páginas grandes = menos requisições (a API pode limitar; tratamos abaixo)
const CACHE_TTL_MS = 30 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function dc(path: string, token: string, tentativas = 3): Promise<{ count?: number; data?: unknown[] }> {
  for (let i = 0; i < tentativas; i++) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get('Retry-After') || '8');
      if (i < tentativas - 1) { await sleep(Math.min(retry, 12) * 1000); continue; }
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Data Crazy ${res.status} em ${path}: ${txt.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error(`Data Crazy: limite de requisições atingido em ${path}.`);
}

// ---- Cache via REST do Supabase (best-effort; nunca derruba a função) -------
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const cacheHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function lerCache(chave: string): Promise<{ payload: Record<string, unknown>; updated_at: string } | null> {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const url = `${SB_URL}/rest/v1/datacrazy_funil_cache?chave=eq.${encodeURIComponent(chave)}&select=payload,updated_at`;
    const res = await fetch(url, { headers: cacheHeaders });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}

async function gravarCache(chave: string, payload: unknown): Promise<void> {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/datacrazy_funil_cache?on_conflict=chave`, {
      method: 'POST',
      headers: { ...cacheHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ chave, payload, updated_at: new Date().toISOString() }),
    });
  } catch { /* ignora falha de cache */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const token = Deno.env.get('DATACRAZY_TOKEN');
  if (!token) return json({ error: 'Token do Data Crazy não configurado. Defina o secret DATACRAZY_TOKEN na função.' });

  const body = await req.json().catch(() => ({}));
  const pipelineId: string | undefined = body.pipelineId || undefined;
  const startDate: string | undefined = body.startDate || undefined;
  const endDate: string | undefined = body.endDate || undefined;
  const force: boolean = !!body.force;
  const chave = `${pipelineId ?? 'default'}|${startDate ?? ''}|${endDate ?? ''}`;

  // 1) Cache fresco?
  if (!force) {
    const cache = await lerCache(chave);
    if (cache && Date.now() - new Date(cache.updated_at).getTime() < CACHE_TTL_MS) {
      return json({ ...cache.payload, doCache: true });
    }
  }

  try {
    // 2) Pipelines
    const pipesResp = await dc('/pipelines', token);
    const pipelines = (pipesResp.data ?? []) as Array<{ id: string; name: string }>;
    if (pipelines.length === 0) return json({ pipelines: [], etapas: [] });
    const pipeAtual = pipelines.find(p => p.id === pipelineId) ?? pipelines[0];

    // 3) Etapas (ordenadas)
    const stagesResp = await dc(`/pipelines/${pipeAtual.id}/stages`, token);
    const stages = ((stagesResp.data ?? []) as Array<{ id: string; name: string; color?: string; index: number }>)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const stageIds = new Set(stages.map(s => s.id));

    // 4) Negócios (paginados) — agrupa por etapa
    const filtros: string[] = [];
    if (startDate) filtros.push(`filter[createdAtGreaterOrEqual]=${encodeURIComponent(startDate)}`);
    if (endDate) filtros.push(`filter[createdAtLessOrEqual]=${encodeURIComponent(endDate)}`);
    const filtroQS = filtros.length ? `&${filtros.join('&')}` : '';

    const contagem = new Map<string, { count: number; valor: number }>();
    // Séries diárias (últimos ~371 dias): leads criados e movimentações por etapa.
    // Data em horário de Brasília (UTC-3) para casar com o resto do sistema.
    const LIMITE = Date.now() - 371 * 24 * 3600 * 1000;
    const OFFSET = 3 * 3600 * 1000;
    const criadosPorDia = new Map<string, number>();
    const movidoDiaEtapa = new Map<string, Map<string, number>>();
    const diaDe = (iso?: string): string | null => {
      if (!iso) return null;
      const t = new Date(iso).getTime();
      if (isNaN(t) || t < LIMITE) return null;
      return new Date(t - OFFSET).toISOString().slice(0, 10);
    };
    type Row = { stageId: string; total?: number; createdAt?: string; lastMovedAt?: string };
    const acumular = (rows: Row[]) => {
      for (const r of rows) {
        if (!r.stageId || !stageIds.has(r.stageId)) continue;
        const cur = contagem.get(r.stageId) ?? { count: 0, valor: 0 };
        cur.count += 1; cur.valor += Number(r.total) || 0;
        contagem.set(r.stageId, cur);
        const dc = diaDe(r.createdAt);
        if (dc) criadosPorDia.set(dc, (criadosPorDia.get(dc) ?? 0) + 1);
        const dm = diaDe(r.lastMovedAt);
        if (dm) {
          let m = movidoDiaEtapa.get(dm);
          if (!m) { m = new Map(); movidoDiaEtapa.set(dm, m); }
          m.set(r.stageId, (m.get(r.stageId) ?? 0) + 1);
        }
      }
    };

    // 1ª página descobre o total e o tamanho real de página (a API pode
    // limitar o take pedido). As demais páginas usam esse tamanho real.
    const primeira = await dc(`/businesses?take=${TAKE}&skip=0${filtroQS}`, token, 5);
    const total = Number(primeira.count ?? 0);
    const primRows = (primeira.data ?? []) as Row[];
    acumular(primRows);
    const pageSize = primRows.length || TAKE; // tamanho que a API de fato devolveu

    const skips: number[] = [];
    if (pageSize > 0) {
      const totalPaginas = Math.min(Math.ceil(total / pageSize), 60);
      for (let p = 1; p < totalPaginas; p++) skips.push(p * pageSize);
    }

    const LOTE = 5; // páginas simultâneas — menos pressão na API (limite 60/min)
    for (let i = 0; i < skips.length; i += LOTE) {
      const bloco = skips.slice(i, i + LOTE);
      const resps = await Promise.all(bloco.map(sk => dc(`/businesses?take=${pageSize}&skip=${sk}${filtroQS}`, token)));
      for (const resp of resps) acumular((resp.data ?? []) as Row[]);
      if (i + LOTE < skips.length) await sleep(300); // espaça os lotes
    }

    const etapas = stages.map(s => ({
      id: s.id, nome: s.name, cor: s.color ?? null, index: s.index,
      count: contagem.get(s.id)?.count ?? 0, valor: contagem.get(s.id)?.valor ?? 0,
    }));

    const payload = {
      pipeline: { id: pipeAtual.id, name: pipeAtual.name },
      pipelines: pipelines.map(p => ({ id: p.id, name: p.name })),
      etapas,
      criadosPorDia: Object.fromEntries(criadosPorDia),
      movidoDiaEtapa: Object.fromEntries([...movidoDiaEtapa].map(([k, v]) => [k, Object.fromEntries(v)])),
      atualizadoEm: new Date().toISOString(),
    };

    await gravarCache(chave, payload);
    return json(payload);
  } catch (e) {
    // A API reclamou (ex.: 429). Em vez de erro na tela, devolve o último
    // cache disponível — mesmo vencido — para o usuário não ver falha.
    const cache = await lerCache(chave);
    if (cache) return json({ ...cache.payload, doCache: true, aviso: 'A API estava ocupada; exibindo os últimos dados salvos.' });
    return json({ error: (e as Error).message });
  }
});

function json(obj: unknown) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
