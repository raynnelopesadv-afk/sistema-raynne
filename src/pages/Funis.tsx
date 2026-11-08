import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingDown, AlertTriangle, RefreshCw, Settings2, Trophy, XCircle, Calendar as CalendarIcon } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { format, startOfMonth, startOfYear, startOfWeek, addMonths, addWeeks, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type Tipo = 'ganho' | 'perdido' | 'neutro';
type Metrica = 'ganho' | 'perdido' | 'novos';
interface Etapa { id: string; nome: string; cor: string | null; index: number; count: number; valor: number; }
interface FunilResp {
  pipeline?: { id: string; name: string };
  pipelines?: { id: string; name: string }[];
  etapas?: Etapa[];
  atualizadoEm?: string;
  error?: string;
  aviso?: string;
  doCache?: boolean;
  criadosPorDia?: Record<string, number>;
  movidoDiaEtapa?: Record<string, Record<string, number>>;
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

const PALETA = ['#A855C7', '#0E7490', '#DC2626', '#F5C518', '#84CC16', '#22C55E', '#111827'];
const COR_METRICA: Record<Metrica, string> = { novos: '#3B82F6', ganho: '#22C55E', perdido: '#DC2626' };
const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dowIdx(ds: string): number {
  return (new Date(ds + 'T12:00:00').getDay() + 6) % 7; // seg=0 ... dom=6
}
function gradeMes(ym: string): Array<Array<{ dia: number; ds: string } | null>> {
  const [y, m] = ym.split('-').map(Number);
  const fim = new Date(y, m, 0).getDate();
  const grade: Array<Array<{ dia: number; ds: string } | null>> = [];
  let linha: Array<{ dia: number; ds: string } | null> = new Array(dowIdx(`${ym}-01`)).fill(null);
  for (let dia = 1; dia <= fim; dia++) {
    const ds = `${ym}-${String(dia).padStart(2, '0')}`;
    linha.push({ dia, ds });
    if (linha.length === 7) { grade.push(linha); linha = []; }
  }
  if (linha.length) { while (linha.length < 7) linha.push(null); grade.push(linha); }
  return grade;
}
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export default function Funis() {
  const [pipelineId, setPipelineId] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  const { start, end } = useMemo(() => {
    if (!range?.from) return { start: undefined as string | undefined, end: undefined as string | undefined };
    const de = new Date(range.from); de.setHours(0, 0, 0, 0);
    const ate = new Date(range.to ?? range.from); ate.setHours(23, 59, 59, 999);
    return { start: de.toISOString(), end: ate.toISOString() };
  }, [range]);

  const forceRef = useRef(false);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['datacrazy-funil', pipelineId, start, end],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<FunilResp> => {
      const { data, error } = await supabase.functions.invoke('funcao-datacrazy-funil-ts', {
        body: { pipelineId, startDate: start, endDate: end, force: forceRef.current },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* ignora */ }
        throw new Error(msg);
      }
      if ((data as FunilResp)?.error) throw new Error((data as FunilResp).error);
      return data as FunilResp;
    },
    retry: false,
  });

  const pipeAtualId = pipelineId ?? data?.pipeline?.id;

  // Série diária completa (sem filtro de período) — alimenta o bloco temporal.
  const { data: serie, refetch: refetchSerie } = useQuery({
    queryKey: ['datacrazy-funil-serie', pipelineId],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<FunilResp> => {
      const { data } = await supabase.functions.invoke('funcao-datacrazy-funil-ts', { body: { pipelineId, force: forceRef.current } });
      return (data ?? {}) as FunilResp;
    },
    retry: false,
  });

  const { data: classRows, refetch: refetchClass } = useQuery({
    queryKey: ['funil-classificacao', pipeAtualId],
    enabled: !!pipeAtualId,
    queryFn: async () => {
      const { data } = await supabase.from('funil_classificacao').select('stage_id, tipo').eq('pipeline_id', pipeAtualId!);
      return (data ?? []) as { stage_id: string; tipo: Exclude<Tipo, 'neutro'> }[];
    },
  });
  const classMap = useMemo(() => {
    const m = new Map<string, Exclude<Tipo, 'neutro'>>();
    (classRows ?? []).forEach(r => m.set(r.stage_id, r.tipo));
    return m;
  }, [classRows]);

  const etapas = data?.etapas ?? [];
  const totalCount = etapas.reduce((s, e) => s + e.count, 0);
  const totalValor = etapas.reduce((s, e) => s + e.valor, 0);

  const resumo = useMemo(() => {
    let gc = 0, gv = 0, pc = 0, pv = 0;
    for (const e of etapas) {
      const t = classMap.get(e.id);
      if (t === 'ganho') { gc += e.count; gv += e.valor; }
      else if (t === 'perdido') { pc += e.count; pv += e.valor; }
    }
    const decididos = gc + pc;
    return {
      ganhoCount: gc, ganhoValor: gv, perdidoCount: pc, perdidoValor: pv,
      temClass: classMap.size > 0,
      taxaConv: totalCount > 0 ? (gc / totalCount) * 100 : 0,
      taxaGanhoDecidido: decididos > 0 ? (gc / decididos) * 100 : 0,
    };
  }, [etapas, classMap, totalCount]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funil de Vendas</h1>
          <p className="text-sm text-muted-foreground mt-1">Etapas do pipe do Data Crazy, com contagem e valor por fase</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(data?.pipelines?.length ?? 0) > 0 && (
            <Select value={pipelineId ?? data?.pipeline?.id ?? ''} onValueChange={setPipelineId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Pipeline" /></SelectTrigger>
              <SelectContent>
                {(data?.pipelines ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <SeletorPeriodo range={range} onChange={setRange} />
          {etapas.length > 0 && pipeAtualId && (
            <ConfigGanhoPerdido
              pipelineId={pipeAtualId}
              pipeNome={data?.pipeline?.name}
              etapas={etapas}
              classMap={classMap}
              onSalvo={refetchClass}
            />
          )}
          <Button variant="outline" size="icon" onClick={async () => { forceRef.current = true; try { await Promise.all([refetch(), refetchSerie()]); } finally { forceRef.current = false; } }} title="Atualizar (busca no Data Crazy)" disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando os negócios do pipe… a primeira carga pode levar alguns segundos.</p>
        </div>
      ) : isError ? (
        <div className="glass-card p-8 space-y-3">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-semibold">Não foi possível carregar o funil do Data Crazy</p>
          </div>
          <p className="text-sm text-muted-foreground">{(error as Error)?.message}</p>
          <p className="text-[11px] text-muted-foreground">
            Verifique se a função foi publicada e se o token da API (secret DATACRAZY_TOKEN) está configurado na Supabase.
          </p>
        </div>
      ) : etapas.length === 0 ? (
        <div className="glass-card p-12 text-center"><p className="text-muted-foreground">Nenhuma etapa encontrada neste pipe.</p></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Negócios no funil" value={String(totalCount)} />
            <Kpi label="Valor total no funil" value={brl(totalValor)} />
            {resumo.temClass ? (
              <>
                <Kpi label="Taxa de conversão" value={`${resumo.taxaConv.toFixed(1)}%`} sub={`${resumo.ganhoCount} ganhos de ${totalCount}`} highlight />
                <Kpi label="Ganho x Perdido" value={`${resumo.taxaGanhoDecidido.toFixed(0)}%`} sub={`${resumo.ganhoCount} ganhos · ${resumo.perdidoCount} perdidos`} />
              </>
            ) : (
              <>
                <Kpi label="Etapas" value={String(etapas.length)} />
                <Kpi label="1ª etapa -> última" value={etapas[0].count > 0 ? `${((etapas[etapas.length - 1].count / etapas[0].count) * 100).toFixed(1)}%` : '—'} highlight />
              </>
            )}
          </div>

          {data?.aviso && (
            <div className="glass-card p-3 flex items-center gap-2 border border-warning/30">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
              <p className="text-xs text-muted-foreground">{data.aviso}</p>
            </div>
          )}

          {resumo.temClass && (
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-4 border border-emerald-500/30">
                <div className="flex items-center gap-2 text-emerald-400"><Trophy className="w-4 h-4" /><span className="text-[11px] uppercase tracking-wider">Ganhos</span></div>
                <p className="text-xl font-bold mt-1 tabular-nums text-emerald-400">{resumo.ganhoCount} <span className="text-sm font-medium text-muted-foreground">· {brl(resumo.ganhoValor)}</span></p>
              </div>
              <div className="glass-card p-4 border border-red-500/30">
                <div className="flex items-center gap-2 text-red-400"><XCircle className="w-4 h-4" /><span className="text-[11px] uppercase tracking-wider">Perdidos</span></div>
                <p className="text-xl font-bold mt-1 tabular-nums text-red-400">{resumo.perdidoCount} <span className="text-sm font-medium text-muted-foreground">· {brl(resumo.perdidoValor)}</span></p>
              </div>
            </div>
          )}

          <div className="glass-card p-6">
            <div className="space-y-2">
              {etapas.map((e, i) => {
                const larguraMax = 92;
                const larguraMin = 26;
                const w = larguraMin + (larguraMax - larguraMin) * (i === 0 ? 1 : (etapas.length - i) / etapas.length);
                const tipo = classMap.get(e.id);
                const cor = tipo === 'ganho' ? '#22C55E' : tipo === 'perdido' ? '#DC2626' : (e.cor || PALETA[i % PALETA.length]);
                const conv = i > 0 && etapas[i - 1].count > 0 ? (e.count / etapas[i - 1].count) * 100 : null;
                return (
                  <div key={e.id} className="flex items-center gap-4">
                    <div className="w-16 text-right shrink-0">
                      {conv !== null && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums">
                          <TrendingDown className="w-3 h-3" /> {conv.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div
                        className="relative flex flex-col items-center justify-center text-white font-semibold py-3 transition-all"
                        style={{
                          width: `${w}%`,
                          background: cor,
                          clipPath: i === 0 ? 'polygon(0 0, 100% 0, 94% 100%, 6% 100%)' : 'polygon(6% 0, 94% 0, 88% 100%, 12% 100%)',
                          minHeight: 52,
                        }}
                      >
                        <span className="text-lg tabular-nums drop-shadow">{e.count}</span>
                        {e.valor > 0 && <span className="text-[11px] opacity-90">{brl(e.valor)}</span>}
                      </div>
                    </div>
                    <div className="w-44 shrink-0">
                      <p className="text-sm font-medium text-foreground truncate flex items-center gap-1" title={e.nome}>
                        {tipo === 'ganho' && <Trophy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        {tipo === 'perdido' && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                        {e.nome}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {data?.atualizadoEm && (
              <p className="text-[10px] text-muted-foreground mt-4 text-right">
                Pipe: {data.pipeline?.name} · atualizado {new Date(data.atualizadoEm).toLocaleString('pt-BR')}
              </p>
            )}
          </div>

          <AnaliseTemporal serie={serie} classMap={classMap} range={range} />
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`glass-card p-4 ${highlight ? 'border border-primary/40' : ''}`}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-1 tabular-nums ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function AnaliseTemporal({ serie, classMap, range }: { serie?: FunilResp; classMap: Map<string, Exclude<Tipo, 'neutro'>>; range: DateRange | undefined }) {
  const [tipoGrafico, setTipoGrafico] = useState<'barra' | 'linha'>('barra');

  const { novos, ganho, perdido } = useMemo(() => {
    const criados = serie?.criadosPorDia ?? {};
    const movido = serie?.movidoDiaEtapa ?? {};
    const ganhoIds = new Set([...classMap].filter(([, t]) => t === 'ganho').map(([id]) => id));
    const perdidoIds = new Set([...classMap].filter(([, t]) => t === 'perdido').map(([id]) => id));
    const g: Record<string, number> = {}, p: Record<string, number> = {};
    for (const [dia, m] of Object.entries(movido)) {
      let sg = 0, sp = 0;
      for (const [sid, c] of Object.entries(m)) { if (ganhoIds.has(sid)) sg += c; if (perdidoIds.has(sid)) sp += c; }
      if (sg) g[dia] = sg; if (sp) p[dia] = sp;
    }
    return { novos: criados, ganho: g, perdido: p };
  }, [serie, classMap]);

  // Gráfico segue o período do calendário do topo. Bucket por mês (períodos
  // longos) ou por semana (períodos curtos, até ~2 meses).
  const { chartData, granularidade } = useMemo(() => {
    let ini: Date, fim: Date;
    if (range?.from) { ini = new Date(range.from); fim = new Date(range.to ?? range.from); }
    else { fim = new Date(); ini = subDays(fim, 364); }
    const dias = (fim.getTime() - ini.getTime()) / 86400000;
    const porMes = dias > 66;
    const buckets: { key: string; label: string; leads: number; ganhos: number; perdidos: number }[] = [];
    const idx = new Map<string, number>();
    if (porMes) {
      let d = startOfMonth(ini); const end = startOfMonth(fim);
      while (d <= end) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        idx.set(key, buckets.length);
        buckets.push({ key, label: format(d, 'MMM/yy', { locale: ptBR }), leads: 0, ganhos: 0, perdidos: 0 });
        d = addMonths(d, 1);
      }
    } else {
      let w = startOfWeek(ini, { weekStartsOn: 1 }); const end = startOfWeek(fim, { weekStartsOn: 1 });
      while (w <= end) {
        const key = ymd(w);
        idx.set(key, buckets.length);
        buckets.push({ key, label: format(w, 'dd/MM', { locale: ptBR }), leads: 0, ganhos: 0, perdidos: 0 });
        w = addWeeks(w, 1);
      }
    }
    const add = (map: Record<string, number>, campo: 'leads' | 'ganhos' | 'perdidos') => {
      for (const [dia, v] of Object.entries(map)) {
        const d = new Date(dia + 'T12:00:00');
        if (d < ini || d > fim) continue;
        const key = porMes ? dia.slice(0, 7) : ymd(startOfWeek(d, { weekStartsOn: 1 }));
        const i = idx.get(key);
        if (i != null) buckets[i][campo] += v;
      }
    };
    add(novos, 'leads'); add(ganho, 'ganhos'); add(perdido, 'perdidos');
    return { chartData: buckets.slice(-24), granularidade: porMes ? 'mês' : 'semana' };
  }, [novos, ganho, perdido, range]);

  const temDados = Object.keys(novos).length + Object.keys(ganho).length + Object.keys(perdido).length > 0;
  if (!temDados) {
    return (
      <div className="glass-card p-6 text-center space-y-1">
        <p className="text-sm font-medium text-foreground">Sem dados diários para os gráficos ainda</p>
        <p className="text-xs text-muted-foreground">Clique no botão de atualizar (↻) no topo para forçar a busca. Se continuar vazio, confirme que a função <code>funcao-datacrazy-funil-ts</code> foi atualizada na Supabase.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Evolução no período</h2>
            <p className="text-[11px] text-muted-foreground">Leads novos, ganhos e perdidos por {granularidade} — segue o período do calendário no topo</p>
          </div>
          <ToggleGroup type="single" value={tipoGrafico} onValueChange={(v) => v && setTipoGrafico(v as 'barra' | 'linha')} className="shrink-0">
            <ToggleGroupItem value="barra" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Barras</ToggleGroupItem>
            <ToggleGroupItem value="linha" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Linha</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            {tipoGrafico === 'barra' ? (
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar name="Leads novos" dataKey="leads" fill={COR_METRICA.novos} radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar name="Ganhos" dataKey="ganhos" fill={COR_METRICA.ganho} radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar name="Perdidos" dataKey="perdidos" fill={COR_METRICA.perdido} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line name="Leads novos" type="monotone" dataKey="leads" stroke={COR_METRICA.novos} strokeWidth={2} dot={false} />
                <Line name="Ganhos" type="monotone" dataKey="ganhos" stroke={COR_METRICA.ganho} strokeWidth={2} dot={false} />
                <Line name="Perdidos" type="monotone" dataKey="perdidos" stroke={COR_METRICA.perdido} strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <MapaCalor novos={novos} ganho={ganho} perdido={perdido} />
    </div>
  );
}

function MapaCalor({ novos, ganho, perdido }: { novos: Record<string, number>; ganho: Record<string, number>; perdido: Record<string, number> }) {
  const [ym, setYm] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [metrica, setMetrica] = useState<Metrica>('ganho');
  const dailyMap = metrica === 'novos' ? novos : metrica === 'ganho' ? ganho : perdido;
  const cor = COR_METRICA[metrica];
  const rotulo = metrica === 'novos' ? 'Leads novos' : metrica === 'ganho' ? 'Ganhos' : 'Perdidos';

  const meses = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const base = new Date(); base.setDate(1);
    for (let i = 0; i < 15; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const l = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      opts.push({ value: v, label: l.charAt(0).toUpperCase() + l.slice(1) });
    }
    return opts;
  }, []);

  const calc = useMemo(() => {
    const grade = gradeMes(ym);
    const cells = grade.flat().filter(Boolean) as { dia: number; ds: string }[];
    const max = Math.max(1, ...cells.map(c => dailyMap[c.ds] || 0));
    const totalPorDow = [0, 0, 0, 0, 0, 0, 0];
    cells.forEach(c => { totalPorDow[dowIdx(c.ds)] += dailyMap[c.ds] || 0; });
    const totalPorSemana = grade.map(l => l.reduce((sum, c) => sum + (c ? dailyMap[c.ds] || 0 : 0), 0));
    const total = totalPorDow.reduce((a, b) => a + b, 0);

    const datas = Object.keys(dailyMap).sort();
    const somaDow = [0, 0, 0, 0, 0, 0, 0], contDow = [0, 0, 0, 0, 0, 0, 0];
    if (datas.length) {
      const hoje = new Date();
      for (let d = new Date(datas[0] + 'T12:00:00'); d <= hoje; d.setDate(d.getDate() + 1)) {
        const ds = ymd(d); const k = dowIdx(ds); somaDow[k] += dailyMap[ds] || 0; contDow[k] += 1;
      }
    }
    const mediaDow = somaDow.map((sm, i) => (contDow[i] ? sm / contDow[i] : 0));

    const hojeStr = ymd(new Date());
    const somaMesDow = [0, 0, 0, 0, 0, 0, 0], contMesDow = [0, 0, 0, 0, 0, 0, 0];
    cells.forEach(c => { if (c.ds <= hojeStr) { const k = dowIdx(c.ds); somaMesDow[k] += dailyMap[c.ds] || 0; contMesDow[k] += 1; } });
    const mediaMesDow = somaMesDow.map((sm, i) => (contMesDow[i] ? sm / contMesDow[i] : 0));

    return { grade, max, totalPorDow, totalPorSemana, total, mediaDow, mediaMesDow };
  }, [ym, dailyMap]);

  const hojeStr = ymd(new Date());

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Mapa de calor · dia a dia</h2>
          <p className="text-[11px] text-muted-foreground">{rotulo} por dia — cor mais forte = mais no dia. Total do mês: <span className="font-semibold text-foreground">{calc.total}</span></p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={ym} onValueChange={setYm}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {meses.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <ToggleGroup type="single" value={metrica} onValueChange={(v) => v && setMetrica(v as Metrica)} className="shrink-0">
            <ToggleGroupItem value="ganho" className="h-9 px-3 text-xs data-[state=on]:bg-emerald-600 data-[state=on]:text-white">Ganhos</ToggleGroupItem>
            <ToggleGroupItem value="perdido" className="h-9 px-3 text-xs data-[state=on]:bg-red-600 data-[state=on]:text-white">Perdidos</ToggleGroupItem>
            <ToggleGroupItem value="novos" className="h-9 px-3 text-xs data-[state=on]:bg-blue-600 data-[state=on]:text-white">Novos</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[70px_repeat(7,1fr)_56px] gap-1.5 mb-1.5">
            <div />
            {DIAS.map(d => <div key={d} className="text-center text-[11px] font-semibold text-primary/80">{d}</div>)}
            <div className="text-center text-[11px] font-semibold text-primary/80">TOTAL</div>
          </div>

          {calc.grade.map((linha, si) => (
            <div key={si} className="grid grid-cols-[70px_repeat(7,1fr)_56px] gap-1.5 mb-1.5">
              <div className="flex items-center text-xs text-muted-foreground">Semana {si + 1}</div>
              {linha.map((c, di) => {
                if (!c) return <div key={di} />;
                const v = dailyMap[c.ds] || 0;
                const futuro = c.ds > hojeStr;
                const a = v > 0 ? 0.18 + 0.82 * (v / calc.max) : 0;
                return (
                  <div
                    key={di}
                    className="relative rounded-lg h-14 flex items-center justify-center border"
                    style={{
                      background: v > 0 ? hexA(cor, a) : 'transparent',
                      borderColor: futuro ? 'hsl(var(--border) / 0.4)' : 'hsl(var(--border))',
                    }}
                    title={`${c.dia} — ${v} ${rotulo.toLowerCase()}`}
                  >
                    <span className="absolute top-1 left-1.5 text-[10px] text-muted-foreground/70">{c.dia}</span>
                    <span className={`text-base font-bold tabular-nums ${v > 0 ? (a > 0.55 ? 'text-white' : 'text-foreground') : 'text-muted-foreground/40'}`}>{v > 0 ? v : '·'}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-center text-sm font-bold tabular-nums text-foreground">{calc.totalPorSemana[si]}</div>
            </div>
          ))}

          <div className="grid grid-cols-[70px_repeat(7,1fr)_56px] gap-1.5 mt-2 pt-2 border-t border-border">
            <div className="flex items-center text-xs text-muted-foreground">Total dia</div>
            {calc.totalPorDow.map((t, i) => <div key={i} className="text-center text-sm font-bold tabular-nums text-foreground">{t}</div>)}
            <div className="text-center text-sm font-bold tabular-nums text-primary">{calc.total}</div>
          </div>
          <div className="grid grid-cols-[70px_repeat(7,1fr)_56px] gap-1.5 mt-1">
            <div className="flex items-center text-xs text-muted-foreground">Média hist.</div>
            {calc.mediaDow.map((md, i) => {
              const acima = calc.mediaMesDow[i] >= md && md > 0;
              return <div key={i} className={`text-center text-[11px] tabular-nums ${acima ? 'text-emerald-400' : 'text-muted-foreground'}`}>{md.toFixed(1)}</div>;
            })}
            <div />
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">"Média hist." é a média por dia da semana em toda a base — verde quando a média deste mês está igual ou acima.</p>
    </div>
  );
}

function SeletorPeriodo({ range, onChange }: { range: DateRange | undefined; onChange: (r: DateRange | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const hoje = new Date();

  const label = !range?.from
    ? 'Todo o período'
    : range.to && range.to.getTime() !== range.from.getTime()
      ? `${format(range.from, 'dd/MM/yy', { locale: ptBR })} – ${format(range.to, 'dd/MM/yy', { locale: ptBR })}`
      : format(range.from, 'dd/MM/yy', { locale: ptBR });

  const presets: { label: string; range: DateRange | undefined }[] = [
    { label: 'Todo o período', range: undefined },
    { label: 'Este mês', range: { from: startOfMonth(hoje), to: hoje } },
    { label: 'Últimos 30 dias', range: { from: subDays(hoje, 29), to: hoje } },
    { label: 'Últimos 90 dias', range: { from: subDays(hoje, 89), to: hoje } },
    { label: 'Este ano', range: { from: startOfYear(hoje), to: hoje } },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start gap-2 min-w-48 font-normal">
          <CalendarIcon className="w-4 h-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-col sm:flex-row">
          <div className="flex sm:flex-col gap-1 p-2 border-b sm:border-b-0 sm:border-r border-border flex-wrap">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => { onChange(p.range); if (!p.range) setOpen(false); }}
                className="text-left text-sm px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={range}
            onSelect={onChange}
            numberOfMonths={2}
            locale={ptBR}
            disabled={{ after: hoje }}
            defaultMonth={range?.from ?? hoje}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ConfigGanhoPerdido({
  pipelineId, pipeNome, etapas, classMap, onSalvo,
}: {
  pipelineId: string;
  pipeNome?: string;
  etapas: Etapa[];
  classMap: Map<string, Exclude<Tipo, 'neutro'>>;
  onSalvo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [sel, setSel] = useState<Record<string, Tipo>>({});

  useEffect(() => {
    if (open) {
      const inicial: Record<string, Tipo> = {};
      etapas.forEach(e => { inicial[e.id] = classMap.get(e.id) ?? 'neutro'; });
      setSel(inicial);
    }
  }, [open, etapas, classMap]);

  const salvar = async () => {
    setSalvando(true);
    await supabase.from('funil_classificacao').delete().eq('pipeline_id', pipelineId);
    const rows = Object.entries(sel)
      .filter(([, t]) => t !== 'neutro')
      .map(([stage_id, tipo]) => ({ pipeline_id: pipelineId, stage_id, tipo }));
    if (rows.length) await supabase.from('funil_classificacao').insert(rows);
    setSalvando(false);
    setOpen(false);
    onSalvo();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Configurar ganho e perdido"><Settings2 className="w-4 h-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ganho e perdido — {pipeNome}</DialogTitle>
          <DialogDescription>
            Marque quais etapas deste pipe representam negócio <span className="text-emerald-400">ganho</span> ou <span className="text-red-400">perdido</span>. As demais ficam neutras (em andamento).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {etapas.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
              <span className="text-sm text-foreground truncate" title={e.nome}>{e.nome} <span className="text-muted-foreground">({e.count})</span></span>
              <ToggleGroup
                type="single"
                value={sel[e.id] ?? 'neutro'}
                onValueChange={(v) => v && setSel(s => ({ ...s, [e.id]: v as Tipo }))}
                className="shrink-0"
              >
                <ToggleGroupItem value="neutro" className="h-7 px-2 text-xs data-[state=on]:bg-muted">Neutro</ToggleGroupItem>
                <ToggleGroupItem value="ganho" className="h-7 px-2 text-xs data-[state=on]:bg-emerald-600 data-[state=on]:text-white">Ganho</ToggleGroupItem>
                <ToggleGroupItem value="perdido" className="h-7 px-2 text-xs data-[state=on]:bg-red-600 data-[state=on]:text-white">Perdido</ToggleGroupItem>
              </ToggleGroup>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
