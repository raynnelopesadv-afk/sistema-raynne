import { supabase } from '@/lib/supabase';
import { fetchVendedores } from '@/lib/vendedores';

type Divisao = 'advogados' | 'educacao';

// periodRef tokens:
//   "YYYY-MM"                       → mês específico
//   "YYYY"                          → ano inteiro
//   "all"                           → todo o período
//   "range:YYYY-MM-DD:YYYY-MM-DD"   → intervalo customizado
export type PeriodKind = 'month' | 'year' | 'all' | 'range';

export function detectPeriodKind(ref?: string): PeriodKind {
  if (!ref) return 'month';
  if (ref === 'all') return 'all';
  if (ref.startsWith('range:')) return 'range';
  if (/^\d{4}$/.test(ref)) return 'year';
  return 'month';
}

function parseRangeToken(ref: string): { start: string; end: string } | null {
  const [, s, e] = ref.split(':');
  if (!s || !e) return null;
  return { start: s, end: e };
}

const ALL_START = '1970-01-01';
const ALL_END = '2999-12-31';

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseMonthRef(monthRef?: string, offset = 0) {
  const now = new Date();
  const kind = detectPeriodKind(monthRef);
  let year = now.getFullYear();
  let month0 = now.getMonth();
  if (kind === 'month') {
    const [rawYear, rawMonth] = (monthRef || '').split('-').map(Number);
    if (Number.isFinite(rawYear)) year = rawYear;
    if (Number.isFinite(rawMonth)) month0 = rawMonth - 1;
  } else if (kind === 'year') {
    year = Number(monthRef);
    month0 = 0;
  }
  const base = new Date(year, month0, 1);
  base.setMonth(base.getMonth() + offset);
  return { year: base.getFullYear(), month0: base.getMonth() };
}

function getReferenceDate(monthRef?: string) {
  const now = new Date();
  const kind = detectPeriodKind(monthRef);
  if (kind === 'all') return now;
  if (kind === 'range') {
    const r = parseRangeToken(monthRef!);
    if (r) {
      const [ey, em, ed] = r.end.split('-').map(Number);
      const end = new Date(ey, em - 1, ed, 12, 0, 0);
      const [sy, sm, sd] = r.start.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd);
      if (now >= start && now <= end) return now;
      return end;
    }
    return now;
  }
  if (kind === 'year') {
    const y = Number(monthRef);
    return now.getFullYear() === y ? now : new Date(y, 11, 31, 12, 0, 0);
  }
  const { year, month0 } = parseMonthRef(monthRef);
  const isCurrentMonth = year === now.getFullYear() && month0 === now.getMonth();
  return isCurrentMonth ? now : new Date(year, month0 + 1, 0, 12, 0, 0);
}

// Range absoluto (timestamp ISO) do período selecionado.
function getMonthRange(periodRef?: string, offset = 0) {
  const kind = detectPeriodKind(periodRef);
  if (kind === 'all') {
    return { start: new Date(1970, 0, 1).toISOString(), end: new Date(2999, 11, 31, 23, 59, 59).toISOString() };
  }
  if (kind === 'range') {
    const r = parseRangeToken(periodRef!);
    if (r) {
      const [sy, sm, sd] = r.start.split('-').map(Number);
      const [ey, em, ed] = r.end.split('-').map(Number);
      const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1;
      const startDate = new Date(sy, sm - 1, sd);
      const endDate = new Date(ey, em - 1, ed, 23, 59, 59);
      if (offset !== 0) {
        startDate.setDate(startDate.getDate() + offset * days);
        endDate.setDate(endDate.getDate() + offset * days);
      }
      return { start: startDate.toISOString(), end: endDate.toISOString() };
    }
  }
  if (kind === 'year') {
    const y = Number(periodRef) + offset;
    return { start: new Date(y, 0, 1).toISOString(), end: new Date(y, 11, 31, 23, 59, 59).toISOString() };
  }
  const { year, month0 } = parseMonthRef(periodRef, offset);
  return { start: new Date(year, month0, 1).toISOString(), end: new Date(year, month0 + 1, 0, 23, 59, 59).toISOString() };
}

// Range em chaves de data (YYYY-MM-DD).
function getMonthDateRange(periodRef?: string, offset = 0) {
  const kind = detectPeriodKind(periodRef);
  if (kind === 'all') {
    return { start: ALL_START, end: ALL_END };
  }
  if (kind === 'range') {
    const r = parseRangeToken(periodRef!);
    if (r) {
      if (offset === 0) return r;
      const [sy, sm, sd] = r.start.split('-').map(Number);
      const [ey, em, ed] = r.end.split('-').map(Number);
      const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1;
      const startDate = new Date(sy, sm - 1, sd);
      const endDate = new Date(ey, em - 1, ed);
      startDate.setDate(startDate.getDate() + offset * days);
      endDate.setDate(endDate.getDate() + offset * days);
      return { start: formatDateKey(startDate), end: formatDateKey(endDate) };
    }
  }
  if (kind === 'year') {
    const y = Number(periodRef) + offset;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const { year, month0 } = parseMonthRef(periodRef, offset);
  return {
    start: formatDateKey(new Date(year, month0, 1)),
    end: formatDateKey(new Date(year, month0 + 1, 0)),
  };
}

function getPrevMonthRange(periodRef?: string) {
  // sem período anterior em "all"
  if (detectPeriodKind(periodRef) === 'all') return { start: new Date(0).toISOString(), end: new Date(0).toISOString() };
  return getMonthRange(periodRef, -1);
}

function getPrevMonthDateRange(periodRef?: string) {
  if (detectPeriodKind(periodRef) === 'all') return { start: ALL_START, end: ALL_START };
  return getMonthDateRange(periodRef, -1);
}

function getWeekRange(monthRef?: string) {
  const ref = getReferenceDate(monthRef);
  const day = ref.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diff);
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diff + 7, 0, 0, -1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getWeekDateRange(monthRef?: string) {
  const ref = getReferenceDate(monthRef);
  const day = ref.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diff);
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diff + 6);
  return { start: formatDateKey(start), end: formatDateKey(end) };
}

function getDayRange(monthRef?: string) {
  const ref = getReferenceDate(monthRef);
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).toISOString();
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59).toISOString();
  return { start, end };
}

function getDayDateRange(monthRef?: string) {
  const today = formatDateKey(getReferenceDate(monthRef));
  return { start: today, end: today };
}

// Aplica filtro de retroativos quando includeRetro = false
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Todas as consultas de contratos passam por aqui:
//  - retroativos conforme a opção do painel
//  - desqualificados/desistência no MESMO mês do fechamento nunca contam
const noRetro = (q: any, includeRetro: boolean) => {
  const base = q.eq('conta_fechamento', true);
  return includeRetro ? base : base.eq('cadastro_retroativo', false);
};

/** IDs dos produtos SEM honorários iniciais (valor é receita futura, não realizada no fechamento). */
async function fetchProdutosSemInicial(divisao: Divisao): Promise<Set<string>> {
  const { data } = await supabase
    .from('products')
    .select('id, tem_honorarios_iniciais')
    .eq('divisao', divisao)
    .eq('tem_honorarios_iniciais', false);
  return new Set((data ?? []).map((p: { id: string }) => p.id));
}


/** Filtros opcionais do painel: closer, squad (via closerIds) e produto. */
export interface DashFiltros { closerId?: string; productId?: string; closerIds?: string[] }

/** Aplica os filtros do painel a uma query de clientes_fechados. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFiltros<T extends { eq: any; in: any }>(q: T, f?: DashFiltros): T {
  if (!f) return q;
  let out: T = q;
  if (f.closerId) out = out.eq('closer_id', f.closerId);
  else if (f.closerIds && f.closerIds.length) out = out.in('closer_id', f.closerIds);
  if (f.productId) out = out.eq('product_id', f.productId);
  return out;
}

// Receita REALIZADA de um período:
//   - produtos COM honorário inicial: valor do contrato no mês do fechamento
//   - produtos SEM honorário inicial (ex.: AMEA): NÃO entram no fechamento;
//     o valor deles é receita futura (aparece na Projeção de Êxito) e só é
//     realizado quando o honorário é efetivamente recebido (data_recebimento).
async function receitaRealizada(divisao: Divisao, start: string, end: string, includeRetro: boolean, semInicial: Set<string>, filtros?: DashFiltros): Promise<number> {
  const [fechados, recebidos] = await Promise.all([
    noRetro(applyFiltros(supabase.from('clientes_fechados').select('valor, product_id').eq('divisao', divisao).gte('data_fechamento', start).lte('data_fechamento', end), filtros), includeRetro),
    noRetro(applyFiltros(supabase.from('clientes_fechados').select('valor_honorarios_recebidos, product_id, data_recebimento').eq('divisao', divisao).not('data_recebimento', 'is', null).gte('data_recebimento', start).lte('data_recebimento', end), filtros), includeRetro),
  ]);
  // fechamentos: só produtos COM honorário inicial (ou sem produto definido)
  const somaFech = (fechados.data ?? []).reduce((sum: number, r: { valor: number | null; product_id: string | null }) => {
    if (r.product_id && semInicial.has(r.product_id)) return sum;
    return sum + (Number(r.valor) || 0);
  }, 0);
  // recebimentos de êxito: só produtos SEM honorário inicial (os COM já contaram no fechamento)
  const somaReceb = (recebidos.data ?? []).reduce((sum: number, r: { valor_honorarios_recebidos: number | null; product_id: string | null }) => {
    if (r.product_id && semInicial.has(r.product_id)) return sum + (Number(r.valor_honorarios_recebidos) || 0);
    return sum;
  }, 0);
  return somaFech + somaReceb;
}

export async function fetchReceita(divisao: Divisao, monthRef?: string, includeRetro = true, filtros?: DashFiltros) {
  const { start, end } = getMonthDateRange(monthRef);
  const prev = getPrevMonthDateRange(monthRef);
  const semInicial = await fetchProdutosSemInicial(divisao);
  const [total, prevTotal] = await Promise.all([
    receitaRealizada(divisao, start, end, includeRetro, semInicial, filtros),
    receitaRealizada(divisao, prev.start, prev.end, includeRetro, semInicial, filtros),
  ]);
  const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
  return { total, change };
}

export async function fetchNovosClientes(divisao: Divisao, monthRef?: string, includeRetro = true) {
  const { start, end } = getMonthDateRange(monthRef);
  const prev = getPrevMonthDateRange(monthRef);
  const [{ count: current }, { count: previous }] = await Promise.all([
    noRetro(supabase.from('clientes_fechados').select('*', { count: 'exact', head: true }).eq('divisao', divisao).gte('data_fechamento', start).lte('data_fechamento', end), includeRetro),
    noRetro(supabase.from('clientes_fechados').select('*', { count: 'exact', head: true }).eq('divisao', divisao).gte('data_fechamento', prev.start).lte('data_fechamento', prev.end), includeRetro),
  ]);
  const c = current ?? 0;
  const p = previous ?? 0;
  const change = p > 0 ? ((c - p) / p) * 100 : 0;
  return { total: c, change };
}

export async function fetchAgendamentos(divisao: Divisao, monthRef?: string) {
  const { start, end } = getMonthRange(monthRef);
  const prev = getPrevMonthRange(monthRef);
  const [{ count: current }, { count: previous }] = await Promise.all([
    supabase.from('agendamentos').select('*', { count: 'exact', head: true }).eq('divisao', divisao).gte('data_agendamento', start).lte('data_agendamento', end),
    supabase.from('agendamentos').select('*', { count: 'exact', head: true }).eq('divisao', divisao).gte('data_agendamento', prev.start).lte('data_agendamento', prev.end),
  ]);
  const c = current ?? 0;
  const p = previous ?? 0;
  const change = p > 0 ? ((c - p) / p) * 100 : 0;
  return { total: c, change };
}

export async function fetchMetaConfig(divisao: Divisao, monthRef?: string) {
  // Lê metas: prioriza override mensal `metas_mes:YYYY-MM`, depois `metas_mes` base, depois `meta_mensal`.
  const kind = detectPeriodKind(monthRef);
  const ym = (() => {
    const { year, month0 } = parseMonthRef(monthRef);
    return `${year}-${String(month0 + 1).padStart(2, '0')}`;
  })();
  const { data } = await supabase
    .from('config')
    .select('chave, valor, meta_mensal')
    .eq('divisao', divisao);
  const rows = data ?? [];
  const metasMesOverride = kind === 'month'
    ? (rows.find(r => r.chave === `metas_mes:${ym}`)?.valor as { faturamento?: number; contratos?: number } | undefined)
    : undefined;
  const metasMes = rows.find(r => r.chave === 'metas_mes')?.valor as { faturamento?: number; contratos?: number } | undefined;
  const metaMensalRow = rows.find(r => r.chave === 'meta_mensal');
  const baseFat = Number(metasMesOverride?.faturamento ?? metasMes?.faturamento ?? metaMensalRow?.meta_mensal ?? 0);
  const baseCont = Number(metasMesOverride?.contratos ?? metasMes?.contratos ?? 0);
  // escala a meta de acordo com o período: ano = 12x, all = sem meta definida
  let multiplier = 1;
  if (kind === 'year') multiplier = 12;
  else if (kind === 'all') multiplier = 0;
  else if (kind === 'range') {
    const r = parseRangeToken(monthRef!);
    if (r) {
      const [sy, sm, sd] = r.start.split('-').map(Number);
      const [ey, em, ed] = r.end.split('-').map(Number);
      const days = Math.max(1, Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1);
      multiplier = days / 30;
    }
  }
  return { faturamento: baseFat * multiplier, contratos: baseCont * multiplier };
}


export async function fetchRanking(divisao: Divisao, monthRef?: string, includeRetro = true) {
  const cur = getMonthDateRange(monthRef);
  const { data: vendasCur } = await noRetro(
    supabase
      .from('clientes_fechados').select('closer_id, valor')
      .eq('divisao', divisao)
      .gte('data_fechamento', cur.start).lte('data_fechamento', cur.end),
    includeRetro,
  );
  if (!vendasCur || vendasCur.length === 0) return [];
  const aggCur: Record<string, number> = {};
  for (const v of vendasCur as Array<{ closer_id: string | null; valor: number | null }>) {
    if (v.closer_id) aggCur[v.closer_id] = (aggCur[v.closer_id] || 0) + (Number(v.valor) || 0);
  }
  const closerIds = Object.keys(aggCur);
  if (closerIds.length === 0) return [];
  const vendedores = await fetchVendedores(divisao);
  const nameMap: Record<string, string> = {};
  for (const v of vendedores) nameMap[v.id] = v.nome;
  const TAXA = 0.50 * 0.50;
  return Object.entries(aggCur)
    .map(([id, total]) => ({
      name: nameMap[id] || 'Desconhecido',
      total,
      esperado: total * TAXA,
    }))
    .sort((a, b) => b.esperado - a.esperado)
    .slice(0, 5);
}

export async function fetchContagensContratos(divisao: Divisao, monthRef?: string, includeRetro = true, filtros?: DashFiltros) {
  const mes = getMonthDateRange(monthRef);
  const sem = getWeekDateRange(monthRef);
  const dia = getDayDateRange(monthRef);
  const [m, s, d] = await Promise.all([
    noRetro(applyFiltros(supabase.from('clientes_fechados').select('*', { count: 'exact', head: true }).eq('divisao', divisao).gte('data_fechamento', mes.start).lte('data_fechamento', mes.end), filtros), includeRetro),
    noRetro(applyFiltros(supabase.from('clientes_fechados').select('*', { count: 'exact', head: true }).eq('divisao', divisao).gte('data_fechamento', sem.start).lte('data_fechamento', sem.end), filtros), includeRetro),
    noRetro(applyFiltros(supabase.from('clientes_fechados').select('*', { count: 'exact', head: true }).eq('divisao', divisao).gte('data_fechamento', dia.start).lte('data_fechamento', dia.end), filtros), includeRetro),
  ]);
  return { mes: m.count ?? 0, semana: s.count ?? 0, hoje: d.count ?? 0 };
}

export async function fetchFechamentoDia(divisao: Divisao, monthRef?: string, includeRetro = true) {
  const mes = getMonthDateRange(monthRef);
  const sem = getWeekDateRange(monthRef);
  const vendedores = await fetchVendedores(divisao);
  if (vendedores.length === 0) return [];
  const ym = `${parseMonthRef(monthRef).year}-${String(parseMonthRef(monthRef).month0 + 1).padStart(2, '0')}`;
  const { data: closerOverrideRow } = await supabase
    .from('config').select('valor').eq('divisao', divisao).eq('chave', `closer_metas:${ym}`).maybeSingle();
  const closerOverrides = ((closerOverrideRow?.valor as Record<string, number>) ?? {});
  const ids = vendedores.map((c) => c.id);


  // Fechamentos do mês e da semana por closer + regras de meta por produto × nível
  const [{ data: fechMes }, { data: fechSem }, { data: closerLevels }, { data: prods }, { data: prodMetas }] = await Promise.all([
    noRetro(supabase.from('clientes_fechados').select('closer_id, product_id').eq('divisao', divisao)
      .in('closer_id', ids).gte('data_fechamento', mes.start).lte('data_fechamento', mes.end), includeRetro),
    noRetro(supabase.from('clientes_fechados').select('closer_id').eq('divisao', divisao)
      .in('closer_id', ids).gte('data_fechamento', sem.start).lte('data_fechamento', sem.end), includeRetro),
    supabase.from('closers').select('id, career_level_id, operacao_product_ids').in('id', ids),
    supabase.from('products').select('id').eq('divisao', divisao).eq('ativo', true),
    supabase.from('product_metas').select('product_id, career_level_id, meta_contratos'),
  ]);
  const countsMes: Record<string, number> = {};
  const countsSem: Record<string, number> = {};
  const produtosVendidos: Record<string, Set<string>> = {};
  for (const f of (fechMes ?? []) as Array<{ closer_id: string | null; product_id: string | null }>) {
    if (!f.closer_id) continue;
    countsMes[f.closer_id] = (countsMes[f.closer_id] || 0) + 1;
    if (f.product_id) (produtosVendidos[f.closer_id] ??= new Set()).add(f.product_id);
  }
  for (const f of (fechSem ?? []) as Array<{ closer_id: string | null }>) if (f.closer_id) countsSem[f.closer_id] = (countsSem[f.closer_id] || 0) + 1;

  const levelByCloser = new Map((closerLevels ?? []).map(c => [c.id, c.career_level_id as string | null]));
  const operacaoByCloser = new Map((closerLevels ?? []).map(c => [c.id, ((c as { operacao_product_ids?: string[] }).operacao_product_ids ?? [])]));
  const prodIdsDivisao = new Set((prods ?? []).map(p => p.id));
  const metaPorProdutoNivel = new Map<string, number>();
  for (const pm of (prodMetas ?? []) as Array<{ product_id: string; career_level_id: string; meta_contratos: number }>) {
    if (prodIdsDivisao.has(pm.product_id)) metaPorProdutoNivel.set(`${pm.product_id}|${pm.career_level_id}`, Number(pm.meta_contratos) || 0);
  }

  // Meta mensal derivada das regras de comissão (produto × nível do closer).
  // Usa os produtos que o closer vendeu no mês; sem vendas, soma todos os
  // produtos da divisão com meta configurada para o nível dele.
  const metaDerivada = (closerId: string): number => {
    const levelId = levelByCloser.get(closerId);
    if (!levelId) return 0;
    // prioridade: operação definida (misto = meta × 2/3) > produtos vendidos no mês > todos da divisão
    const operacao = (operacaoByCloser.get(closerId) ?? []).filter(pid => prodIdsDivisao.has(pid));
    if (operacao.length > 0) {
      const misto = operacao.length >= 2;
      return operacao.reduce((s, pid) => {
        const m = metaPorProdutoNivel.get(`${pid}|${levelId}`) ?? 0;
        return s + (misto ? Math.floor((m * 2) / 3) : m);
      }, 0);
    }
    const vendidos = produtosVendidos[closerId];
    const base = vendidos && vendidos.size > 0 ? Array.from(vendidos) : Array.from(prodIdsDivisao);
    return base.reduce((s, pid) => s + (metaPorProdutoNivel.get(`${pid}|${levelId}`) ?? 0), 0);
  };

  // Leads da semana para conversão
  const { count: agendSem } = await supabase
    .from('agendamentos').select('*', { count: 'exact', head: true })
    .eq('divisao', divisao).gte('data_agendamento', sem.start).lte('data_agendamento', sem.end);
  const totalLeads = agendSem ?? 0;

  // Semanas restantes no mês (incluindo a corrente)
  const now = getReferenceDate(monthRef);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksRemaining = Math.max(1, Math.ceil((lastDay.getTime() - now.getTime()) / msPerWeek));

  return vendedores
    .map((c) => {
      // prioridade: override do mês > meta manual do closer > derivada das regras de comissão
      const manual = closerOverrides[c.id] != null ? Number(closerOverrides[c.id]) : (c.meta_mes || 0);
      const metaMes = manual > 0 ? manual : metaDerivada(c.id);
      const feitoMes = countsMes[c.id] || 0;
      const feitoSem = countsSem[c.id] || 0;
      const restante = Math.max(0, metaMes - feitoMes);
      const metaSemana = metaMes > 0 ? Math.ceil(restante / weeksRemaining) : 0;
      const conv = totalLeads > 0 ? (feitoSem / totalLeads) * 100 : 0;
      const pctMes = metaMes > 0 ? (feitoMes / metaMes) * 100 : 0;
      return { id: c.id, nome: c.nome, meta_dia: metaSemana, feito: feitoSem, conv, meta_mes: metaMes, feito_mes: feitoMes, pct_mes: pctMes };
    })
    .sort((a, b) => b.feito - a.feito);
}


export async function fetchFiliais(divisao: Divisao, monthRef?: string, includeRetro = true) {
  const mes = getMonthDateRange(monthRef);
  const sem = getWeekDateRange(monthRef);
  const [{ data: dataMes }, { data: dataSem }] = await Promise.all([
    noRetro(supabase.from('clientes_fechados').select('filial').eq('divisao', divisao).gte('data_fechamento', mes.start).lte('data_fechamento', mes.end), includeRetro),
    noRetro(supabase.from('clientes_fechados').select('filial').eq('divisao', divisao).gte('data_fechamento', sem.start).lte('data_fechamento', sem.end), includeRetro),
  ]);
  const agg = (rows: { filial: string | null }[] | null) => {
    const m: Record<string, number> = {};
    for (const r of rows ?? []) {
      const k = r.filial || 'Matriz';
      m[k] = (m[k] || 0) + 1;
    }
    return Object.entries(m)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  };
  return { mes: agg(dataMes), semana: agg(dataSem) };
}

export async function fetchSquadsDashboard(divisao: Divisao, monthRef?: string, includeRetro = true) {
  const { start, end } = getMonthDateRange(monthRef);
  const ym = `${parseMonthRef(monthRef).year}-${String(parseMonthRef(monthRef).month0 + 1).padStart(2, '0')}`;
  const [{ data: squads }, vendedores, { data: fechamentos }, { data: squadOvRow }] = await Promise.all([
    supabase.from('squads').select('id, nome, motto, bandeira_url, meta_mensal').eq('divisao', divisao).eq('ativo', true).order('nome'),
    fetchVendedores(divisao),
    noRetro(supabase.from('clientes_fechados').select('closer_id, valor').eq('divisao', divisao).gte('data_fechamento', start).lte('data_fechamento', end), includeRetro),
    supabase.from('config').select('valor').eq('divisao', divisao).eq('chave', `squad_metas:${ym}`).maybeSingle(),
  ]);

  const squadOverrides = ((squadOvRow?.valor as Record<string, number>) ?? {});
  const metaFor = (s: { id: string; meta_mensal: number | null }) =>
    squadOverrides[s.id] != null ? Number(squadOverrides[s.id]) : Number(s.meta_mensal) || 0;

  const squadById = new Map((squads ?? []).map((s) => [s.id, s]));
  const vendedorById = new Map(vendedores.map((v) => [v.id, v]));
  const stats: Record<string, { fechados: number; meta: number }> = {};
  const closersBySquadRaw: Record<string, Record<string, { name: string; total: number }>> = {};

  for (const squad of squads ?? []) stats[squad.nome] = { fechados: 0, meta: metaFor(squad) };

  for (const fechamento of (fechamentos ?? []) as Array<{ closer_id: string | null; valor: number | null }>) {
    const vendedor = fechamento.closer_id ? vendedorById.get(fechamento.closer_id) : null;
    const squad = vendedor?.squad_id ? squadById.get(vendedor.squad_id) : null;
    if (!squad || !vendedor) continue;
    stats[squad.nome] = stats[squad.nome] ?? { fechados: 0, meta: metaFor(squad) };
    stats[squad.nome].fechados += 1;
    closersBySquadRaw[squad.nome] = closersBySquadRaw[squad.nome] ?? {};
    const closer = closersBySquadRaw[squad.nome][vendedor.id] ?? { name: vendedor.nome, total: 0 };
    closer.total += 1;
    closersBySquadRaw[squad.nome][vendedor.id] = closer;
  }

  const closersBySquad = Object.fromEntries(
    Object.entries(closersBySquadRaw).map(([name, rows]) => [name, Object.values(rows).sort((a, b) => b.total - a.total)])
  );

  return {
    squads: (squads ?? []).map((s) => ({ id: s.id, name: s.nome, motto: s.motto ?? '', img: s.bandeira_url ?? '', fechados: 0, meta: metaFor(s) })),
    stats,
    closersBySquad,
  };
}


export async function fetchAllDashboardData(divisao: Divisao, monthRef?: string, includeRetro = true, filtros?: DashFiltros) {
  const [receita, clientes, agendamentos, metaMensal, ranking, contagens, fechamentoDia, filiais, squadsData] = await Promise.all([
    fetchReceita(divisao, monthRef, includeRetro, filtros),
    fetchNovosClientes(divisao, monthRef, includeRetro),
    fetchAgendamentos(divisao, monthRef),
    fetchMetaConfig(divisao, monthRef),
    fetchRanking(divisao, monthRef, includeRetro),
    fetchContagensContratos(divisao, monthRef, includeRetro, filtros).catch(() => ({ mes: 0, semana: 0, hoje: 0 })),
    fetchFechamentoDia(divisao, monthRef, includeRetro).catch(() => []),
    fetchFiliais(divisao, monthRef, includeRetro).catch(() => ({ mes: [], semana: [] })),
    fetchSquadsDashboard(divisao, monthRef, includeRetro).catch(() => ({ squads: [], stats: {}, closersBySquad: {} })),
  ]);
  const metaPct = metaMensal.faturamento > 0 ? (receita.total / metaMensal.faturamento) * 100 : 0;
  return { receita, clientes, agendamentos, metaMensal: metaMensal.faturamento, metaContratos: metaMensal.contratos, metaPct, ranking, contagens, fechamentoDia, filiais, squadsData };
}
